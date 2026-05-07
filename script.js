const API_URL = 'http://localhost:4000/api';
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user'));
let currentProject = null;
let currentTask = null;
let users = [];

// Socket.io
const socket = io('http://localhost:4000');

// Check Auth
if (!token && window.location.pathname.includes('index.html')) {
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('index.html')) {
    initApp();
  }
});

async function initApp() {
  document.getElementById('user-info').querySelector('span').textContent = user.username;
  
  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
  });

  // Load Projects & Users
  fetchProjects();
  fetchUsers();

  // Modals
  setupModals();
  setupDragAndDrop();

  // Socket events
  socket.on('taskCreated', task => {
    if (currentProject && currentProject._id === task.project) {
      renderTask(task);
      updateTaskCounts();
    }
  });

  socket.on('taskUpdated', task => {
    if (currentProject && currentProject._id === task.project) {
      const taskEl = document.getElementById(`task-${task._id}`);
      if (taskEl) taskEl.remove();
      renderTask(task);
      updateTaskCounts();
      
      // Update modal if open
      if (currentTask && currentTask._id === task._id) {
        document.getElementById('detail-task-status').value = task.status;
        currentTask = task;
      }
    }
  });

  socket.on('commentAdded', ({ comment, taskId }) => {
    if (currentTask && currentTask._id === taskId) {
      renderComment(comment);
    }
  });
}

async function fetchProjects() {
  const res = await fetch(`${API_URL}/projects`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    const projects = await res.json();
    const list = document.getElementById('project-list');
    list.innerHTML = '';
    projects.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.name;
      li.dataset.id = p._id;
      li.addEventListener('click', () => selectProject(p));
      list.appendChild(li);
    });
  }
}

async function fetchUsers() {
  const res = await fetch(`${API_URL}/auth/users`);
  if (res.ok) {
    users = await res.json();
    const assigneeSelect = document.getElementById('task-assignee');
    users.forEach(u => {
      const option = document.createElement('option');
      option.value = u._id;
      option.textContent = u.username;
      assigneeSelect.appendChild(option);
    });
  }
}

async function selectProject(project) {
  currentProject = project;
  socket.emit('joinProject', project._id);
  
  document.querySelectorAll('#project-list li').forEach(li => li.classList.remove('active'));
  document.querySelector(`#project-list li[data-id="${project._id}"]`).classList.add('active');

  document.getElementById('current-project-title').textContent = project.name;
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('board-container').style.display = 'flex';
  document.getElementById('btn-add-task').style.display = 'block';

  // Clear boards
  document.getElementById('list-todo').innerHTML = '';
  document.getElementById('list-in-progress').innerHTML = '';
  document.getElementById('list-done').innerHTML = '';

  // Fetch tasks
  const res = await fetch(`${API_URL}/tasks/project/${project._id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    const tasks = await res.json();
    tasks.forEach(task => renderTask(task));
    updateTaskCounts();
  }
}

function renderTask(task) {
  const listId = task.status === 'Todo' ? 'list-todo' : task.status === 'In Progress' ? 'list-in-progress' : 'list-done';
  const list = document.getElementById(listId);
  
  const card = document.createElement('div');
  card.className = 'task-card';
  card.id = `task-${task._id}`;
  card.draggable = true;
  card.dataset.id = task._id;
  
  card.innerHTML = `
    <h4>${task.title}</h4>
    <p>${task.description || ''}</p>
    <div class="task-meta">
      <span class="task-assignee">${task.assignee ? task.assignee.username : 'Unassigned'}</span>
    </div>
  `;
  
  card.addEventListener('click', () => openTaskDetail(task));
  
  // Drag events
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', task._id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  list.appendChild(card);
}

function updateTaskCounts() {
  ['Todo', 'In Progress', 'Done'].forEach(status => {
    const listId = status === 'Todo' ? 'list-todo' : status === 'In Progress' ? 'list-in-progress' : 'list-done';
    const count = document.getElementById(listId).children.length;
    document.querySelector(`.board-column[data-status="${status}"] .task-count`).textContent = count;
  });
}

function setupDragAndDrop() {
  document.querySelectorAll('.task-list').forEach(list => {
    list.addEventListener('dragover', e => {
      e.preventDefault();
      list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', () => {
      list.classList.remove('drag-over');
    });
    list.addEventListener('drop', async e => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = list.parentElement.dataset.status;
      
      const card = document.getElementById(`task-${taskId}`);
      if (card) {
        list.appendChild(card);
        updateTaskCounts();
        
        // Update backend
        const res = await fetch(`${API_URL}/tasks/${taskId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          const updatedTask = await res.json();
          socket.emit('taskUpdated', { projectId: currentProject._id, task: updatedTask });
        }
      }
    });
  });
}

function setupModals() {
  // New Project
  const modalProject = document.getElementById('modal-project');
  document.getElementById('btn-new-project').addEventListener('click', () => modalProject.style.display = 'flex');
  document.getElementById('submit-project').addEventListener('click', async () => {
    const name = document.getElementById('project-name').value;
    const desc = document.getElementById('project-desc').value;
    const res = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, description: desc })
    });
    if (res.ok) {
      modalProject.style.display = 'none';
      document.getElementById('project-name').value = '';
      document.getElementById('project-desc').value = '';
      fetchProjects();
    }
  });

  // Add Task
  const modalTask = document.getElementById('modal-task');
  document.getElementById('btn-add-task').addEventListener('click', () => modalTask.style.display = 'flex');
  document.getElementById('submit-task').addEventListener('click', async () => {
    const title = document.getElementById('task-title').value;
    const desc = document.getElementById('task-desc').value;
    const assignee = document.getElementById('task-assignee').value;
    
    const res = await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title,
        description: desc,
        assignee: assignee || null,
        project: currentProject._id
      })
    });
    if (res.ok) {
      const task = await res.json();
      modalTask.style.display = 'none';
      document.getElementById('task-title').value = '';
      document.getElementById('task-desc').value = '';
      document.getElementById('task-assignee').value = '';
      
      renderTask(task);
      updateTaskCounts();
      socket.emit('taskCreated', { projectId: currentProject._id, task });
    }
  });

  // Task Detail Update Status
  document.getElementById('detail-task-status').addEventListener('change', async (e) => {
    if (!currentTask) return;
    const newStatus = e.target.value;
    const res = await fetch(`${API_URL}/tasks/${currentTask._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      const updatedTask = await res.json();
      
      const card = document.getElementById(`task-${currentTask._id}`);
      if (card) card.remove();
      renderTask(updatedTask);
      updateTaskCounts();
      
      socket.emit('taskUpdated', { projectId: currentProject._id, task: updatedTask });
    }
  });

  // Add Comment
  document.getElementById('submit-comment').addEventListener('click', async () => {
    const text = document.getElementById('comment-input').value;
    if (!text || !currentTask) return;

    const res = await fetch(`${API_URL}/tasks/${currentTask._id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });
    
    if (res.ok) {
      const comment = await res.json();
      document.getElementById('comment-input').value = '';
      renderComment(comment);
      socket.emit('commentAdded', { projectId: currentProject._id, comment, taskId: currentTask._id });
    }
  });

  // Close modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal-overlay').style.display = 'none';
    });
  });
}

async function openTaskDetail(task) {
  currentTask = task;
  const modal = document.getElementById('modal-task-detail');
  
  document.getElementById('detail-task-title').textContent = task.title;
  document.getElementById('detail-task-desc').textContent = task.description || 'No description provided.';
  document.getElementById('detail-task-status').value = task.status;
  document.getElementById('detail-task-assignee').textContent = task.assignee ? task.assignee.username : 'Unassigned';
  
  // Load comments
  const list = document.getElementById('comments-list');
  list.innerHTML = 'Loading comments...';
  
  const res = await fetch(`${API_URL}/tasks/${task._id}/comments`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const comments = await res.json();
    list.innerHTML = '';
    comments.forEach(c => renderComment(c));
  } else {
    list.innerHTML = 'Error loading comments.';
  }
  
  modal.style.display = 'flex';
}

function renderComment(comment) {
  const list = document.getElementById('comments-list');
  const div = document.createElement('div');
  div.className = 'comment';
  const time = new Date(comment.createdAt).toLocaleString();
  div.innerHTML = `
    <div class="comment-header">
      <span class="comment-author">${comment.author.username}</span>
      <span class="comment-time">${time}</span>
    </div>
    <div class="comment-text">${comment.text}</div>
  `;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}
