const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {}; // roomName -> { teacher: ws, students: Map studentId -> { ws, name }, nextStudentId: number }

wss.on('connection', (ws) => {
  ws.id = null;
  ws.role = null;
  ws.room = null;

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }
    const { type, room, payload, to } = data;

    if (!room) return;

    if (!rooms[room]) {
      rooms[room] = {
        teacher: null,
        students: new Map(),
        nextStudentId: 1,
      };
    }

    const currentRoom = rooms[room];

    switch (type) {
      case 'join':
        if (payload.role === 'teacher') {
          if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Room already has a teacher. Please choose a different room name.'
            }));
            ws.close();
            return;
          }

          currentRoom.teacher = ws;
          ws.role = 'teacher';
          ws.room = room;
          ws.id = 'teacher';

          // Send back joined + existing students with id and name
          const studentsList = Array.from(currentRoom.students.entries()).map(([id, student]) => ({
            id,
            name: student.name
          }));

          ws.send(JSON.stringify({
            type: 'joined',
            role: 'teacher',
            students: studentsList
          }));
        } else if (payload.role === 'student') {
          if (!currentRoom.teacher || currentRoom.teacher.readyState !== WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'No active teacher in the room. Please join a different room.'
            }));
            ws.close();
            return;
          }

          const studentId = `student${currentRoom.nextStudentId++}`;
          ws.role = 'student';
          ws.room = room;
          ws.id = studentId;

          const studentName = payload.name || "Anonymous";
          currentRoom.students.set(studentId, { ws, name: studentName });

          ws.send(JSON.stringify({
            type: 'joined',
            role: 'student',
            id: studentId,
            name: studentName
          }));

          // Notify teacher about new student with name
          if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
            currentRoom.teacher.send(JSON.stringify({
              type: 'student-joined',
              id: studentId,
              name: studentName
            }));
          }
        }
        break;

      case 'offer':
        if (ws.role === 'teacher' && to && currentRoom.students.has(to)) {
          const student = currentRoom.students.get(to);
          if (student.ws.readyState === WebSocket.OPEN) {
            student.ws.send(JSON.stringify({
              type: 'offer',
              payload,
              from: 'teacher'
            }));
          }
        }
        break;

      case 'answer':
        if (ws.role === 'student' && currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
          currentRoom.teacher.send(JSON.stringify({
            type: 'answer',
            payload,
            from: ws.id
          }));
        }
        break;

      case 'candidate':
        if (ws.role === 'teacher' && to && currentRoom.students.has(to)) {
          const student = currentRoom.students.get(to);
          if (student.ws.readyState === WebSocket.OPEN) {
            student.ws.send(JSON.stringify({
              type: 'candidate',
              payload,
              from: 'teacher'
            }));
          }
        } else if (ws.role === 'student' && currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
          currentRoom.teacher.send(JSON.stringify({
            type: 'candidate',
            payload,
            from: ws.id
          }));
        }
        break;

      case 'leave':
        if (ws.role === 'student') {
          if (currentRoom.students.has(ws.id)) {
            currentRoom.students.delete(ws.id);
            if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
              currentRoom.teacher.send(JSON.stringify({
                type: 'student-left',
                id: ws.id
              }));
            }
          }
          ws.room = null;
          ws.id = null;
          ws.role = null;
        } else if (ws.role === 'teacher') {
          currentRoom.students.forEach(student => {
            if (student.ws.readyState === WebSocket.OPEN) {
              student.ws.send(JSON.stringify({ type: 'teacher-left' }));
              student.ws.room = null;
              student.ws.id = null;
              student.ws.role = null;
            }
          });
          delete rooms[room];
          ws.room = null;
          ws.id = null;
          ws.role = null;
        }
        break;

      case 'content-update':
        // New message type from teacher to update shared content for all students
        if (ws.role === 'teacher' && payload) {
          const { contentType, link, notes } = payload; // notes is optional if contentType = 'notes'
          currentRoom.students.forEach(student => {
            if (student.ws.readyState === WebSocket.OPEN) {
              student.ws.send(JSON.stringify({
                type: 'content-update',
                payload: { contentType, link, notes }
              }));
            }
          });
        }
        break;
    }
  });

  ws.on('close', () => {
    if (!ws.room || !rooms[ws.room]) return;
    const currentRoom = rooms[ws.room];

    if (ws.role === 'teacher') {
      currentRoom.students.forEach(student => {
        if (student.ws.readyState === WebSocket.OPEN) {
          student.ws.send(JSON.stringify({ type: 'teacher-left' }));
          student.ws.room = null;
          student.ws.id = null;
          student.ws.role = null;
        }
      });
      delete rooms[ws.room];
    } else if (ws.role === 'student') {
      if (currentRoom.students.has(ws.id)) {
        currentRoom.students.delete(ws.id);
        if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
          currentRoom.teacher.send(JSON.stringify({
            type: 'student-left',
            id: ws.id
          }));
        }
      }
    }

    ws.room = null;
    ws.id = null;
    ws.role = null;
  });
});

console.log(`Signaling server running on port ${PORT}`);
