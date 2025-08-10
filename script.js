const wsUrl = "wss://splitclass-main-production.up.railway.app";
let socket = null;
let role = null; // 'teacher' or 'student'
let room = null;
let userName = null;

// Elements
const setupSection = document.getElementById("setup");
const mainSection = document.getElementById("main");

const roomInput = document.getElementById("roomInput");
const studentNameInput = document.getElementById("studentNameInput");

const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const statusText = document.getElementById("status");

const displayName = document.getElementById("displayName");
const displayRoom = document.getElementById("displayRoom");

const leftPane = document.getElementById("leftPane");
const videoElem = document.getElementById("video");

const studentsListContainer = document.getElementById("studentsListContainer");
const studentsList = document.getElementById("studentsList");
const studentCountDisplay = document.getElementById("studentCountDisplay");

const rightPane = document.getElementById("rightPane");

const teacherControls = document.querySelectorAll("#teacherControls");
const studentControls = document.getElementById("studentControls");

const contentSelect = document.getElementById("contentSelect");
const customLinkInput = document.getElementById("customLinkInput");
const btnClearPdf = document.getElementById("btnClearPdf");

const notesArea = document.getElementById("notesArea");
const pdfViewerContainer = document.getElementById("pdfViewerContainer");
const pdfViewer = document.getElementById("pdfViewer");
const customIframe = document.getElementById("customIframe");

const btnCloseSessionTeacher = document.getElementById("btnCloseSessionTeacher");
const btnCloseSessionStudent = document.getElementById("btnCloseSessionStudent");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnDownloadNotes = document.getElementById("btnDownloadNotes");

// Helper to show/hide teacher controls (multiple elements with id #teacherControls)
function setTeacherControlsVisible(visible) {
  teacherControls.forEach(ctrl => {
    ctrl.classList.toggle("hidden", !visible);
  });
}

// Show/hide student controls
function setStudentControlsVisible(visible) {
  studentControls.classList.toggle("hidden", !visible);
}

// Clear all right pane content areas
function clearRightPane() {
  notesArea.classList.add("hidden");
  pdfViewerContainer.classList.add("hidden");
  customIframe.classList.add("hidden");
  pdfViewer.src = "";
  customIframe.src = "";
  notesArea.value = "";
}

// Render content on student side based on received content type & payload
function renderContent(type, payload) {
  clearRightPane();

  if (type === "notes") {
    notesArea.value = payload.text || "";
    notesArea.readOnly = true;
    notesArea.classList.remove("hidden");
  } else if (type === "pdf") {
    if (payload.url) {
      pdfViewer.src = payload.url;
      pdfViewerContainer.classList.remove("hidden");
    }
  } else if (type === "link") {
    if (payload.url) {
      customIframe.src = payload.url;
      customIframe.classList.remove("hidden");
    }
  }
}

// Send JSON message via WebSocket safely
function sendMessage(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

// Connect WebSocket and setup event handlers
function connectWebSocket() {
  socket = new WebSocket(wsUrl);

  socket.addEventListener("open", () => {
    statusText.textContent = "Connected to server.";

    // Send join message with role and name
    sendMessage({
      type: "join",
      room,
      payload: {
        role,
        name: userName
      }
    });
  });

  socket.addEventListener("message", (evt) => {
    const msg = evt.data;
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    switch (data.type) {
      case "joined":
        if (role === "teacher") {
          // Show teacher controls, hide video, show student list
          studentsListContainer.classList.remove("hidden");
          videoElem.style.display = "none";
          displayName.textContent = userName;
          displayRoom.textContent = room;
          setupSection.classList.add("hidden");
          mainSection.classList.remove("hidden");
          setTeacherControlsVisible(true);
          setStudentControlsVisible(false);
          updateStudentList(data.students || []);
          // Show notes area by default for teacher
          showTeacherContentUI("notes");
        } else if (role === "student") {
          // Show video, hide student list
          studentsListContainer.classList.add("hidden");
          videoElem.style.display = "block";
          displayName.textContent = userName;
          displayRoom.textContent = room;
          setupSection.classList.add("hidden");
          mainSection.classList.remove("hidden");
          setTeacherControlsVisible(false);
          setStudentControlsVisible(true);
          clearRightPane();
          // Start with empty content, wait for teacher broadcast
        }
        break;

      case "error":
        statusText.textContent = `Error: ${data.message || "Unknown error"}`;
        break;

      case "student-joined":
        if (role === "teacher") {
          addStudentToList(data.id, data.name);
        }
        break;

      case "student-left":
        if (role === "teacher") {
          removeStudentFromList(data.id);
        }
        break;

      case "teacher-left":
        alert("Teacher has left the session. You will be disconnected.");
        window.location.reload();
        break;

      case "content-update":
        if (role === "student") {
          renderContent(data.contentType, data.payload);
        }
        break;

      case "notes-update":
        if (role === "student" && data.payload && data.payload.text !== undefined) {
          notesArea.value = data.payload.text;
        }
        break;

      // Add other message handling like WebRTC offers, answers, candidates here if needed
    }
  });

  socket.addEventListener("close", () => {
    statusText.textContent = "Disconnected from server.";
    alert("Connection lost. Please refresh to reconnect.");
  });

  socket.addEventListener("error", (err) => {
    console.error("WebSocket error:", err);
    statusText.textContent = "WebSocket error occurred.";
  });
}

// Update student list UI for teacher
function updateStudentList(students) {
  studentsList.innerHTML = "";
  students.forEach(({ id, name }) => {
    addStudentToList(id, name);
  });
  studentCountDisplay.textContent = students.length;
}

function addStudentToList(id, name) {
  const li = document.createElement("li");
  li.id = `student-${id}`;
  li.textContent = name || "Anonymous";
  studentsList.appendChild(li);
  studentCountDisplay.textContent = studentsList.children.length;
}

function removeStudentFromList(id) {
  const li = document.getElementById(`student-${id}`);
  if (li) li.remove();
  studentCountDisplay.textContent = studentsList.children.length;
}

// When teacher changes content type dropdown
function onContentTypeChange() {
  const val = contentSelect.value;

  if (val === "link") {
    customLinkInput.style.display = "inline-block";
  } else {
    customLinkInput.style.display = "none";
    customLinkInput.value = "";
  }

  // Clear pdf clear button visibility
  btnClearPdf.style.display = val === "pdf" ? "inline-block" : "none";

  showTeacherContentUI(val);

  broadcastContentUpdate();
}

// Show/hide inputs based on teacher selected content type
function showTeacherContentUI(type) {
  clearRightPane();

  if (type === "notes") {
    notesArea.readOnly = false;
    notesArea.classList.remove("hidden");
  } else if (type === "pdf") {
    pdfViewerContainer.classList.remove("hidden");
  } else if (type === "link") {
    customIframe.classList.remove("hidden");
  }
}

// Broadcast content changes from teacher to students
function broadcastContentUpdate() {
  const type = contentSelect.value;

  if (type === "notes") {
    sendMessage({
      type: "content-update",
      room,
      contentType: "notes",
      payload: { text: notesArea.value }
    });
  } else if (type === "pdf") {
    const url = pdfViewer.src || "";
    sendMessage({
      type: "content-update",
      room,
      contentType: "pdf",
      payload: { url }
    });
  } else if (type === "link") {
    const url = customLinkInput.value.trim();
    sendMessage({
      type: "content-update",
      room,
      contentType: "link",
      payload: { url }
    });
  }
}

// Download notes as .txt file
function downloadNotes() {
  const text = notesArea.value;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes_${room || "session"}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Clear PDF viewer (teacher)
function clearPdf() {
  pdfViewer.src = "";
  broadcastContentUpdate();
}

// Setup event listeners for teacher inputs
function setupTeacherEvents() {
  contentSelect.addEventListener("change", onContentTypeChange);

  customLinkInput.addEventListener("input", () => {
    broadcastContentUpdate();
  });

  notesArea.addEventListener("input", () => {
    // Send notes update as teacher types (throttle if needed)
    broadcastContentUpdate();
  });

  btnClearPdf.addEventListener("click", clearPdf);

  btnDownloadNotes.addEventListener("click", downloadNotes);

  btnCloseSessionTeacher.addEventListener("click", () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendMessage({ type: "leave", room, payload: {} });
      socket.close();
    }
    window.location.reload();
  });

  btnShareScreen.addEventListener("click", () => {
    alert("Screen sharing functionality not implemented in this version.");
  });
}

// Setup event listeners for student buttons
function setupStudentEvents() {
  btnCloseSessionStudent.addEventListener("click", () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendMessage({ type: "leave", room, payload: {} });
      socket.close();
    }
    window.location.reload();
  });
}

// Handle join buttons click
btnTeacher.addEventListener("click", () => {
  const r = roomInput.value.trim();
  const n = studentNameInput.value.trim();

  if (!r) {
    statusText.textContent = "Please enter a room name.";
    return;
  }

  room = r;
  userName = n || "Teacher";
  role = "teacher";

  connectWebSocket();
});

btnStudent.addEventListener("click", () => {
  const r = roomInput.value.trim();
  const n = studentNameInput.value.trim();

  if (!r) {
    statusText.textContent = "Please enter a room name.";
    return;
  }
  if (!n) {
    statusText.textContent = "Please enter your name.";
    return;
  }

  room = r;
  userName = n;
  role = "student";

  connectWebSocket();
});

// On load, hide all content areas except setup
function init() {
  mainSection.classList.add("hidden");
  setupSection.classList.remove("hidden");
  clearRightPane();
  setTeacherControlsVisible(false);
  setStudentControlsVisible(false);
}

init();
