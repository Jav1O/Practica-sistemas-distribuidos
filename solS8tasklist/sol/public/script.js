const apiUrl = '/api/tasks';

// Función para cargar las tareas al iniciar la página
async function fetchTasks() {
  const response = await fetch(apiUrl);
  const tasks = await response.json();
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  tasks.forEach(task => {
    const li = document.createElement('li');
    li.textContent = task.title;
    li.dataset.id = task.id;

    // Botón para eliminar tarea
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Eliminar';
    deleteBtn.onclick = () => deleteTask(task.id);

    // Botón para editar tarea
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar';
    editBtn.onclick = () => editTask(task);

    li.appendChild(deleteBtn);
    li.appendChild(editBtn);
    list.appendChild(li);
  });
}

// Función para agregar una nueva tarea
async function addTask(title) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });
  if (response.ok) {
    fetchTasks();
  }
}

// Función para eliminar una tarea
async function deleteTask(id) {
  const response = await fetch(`${apiUrl}/${id}`, {
    method: 'DELETE'
  });
  if (response.ok) {
    fetchTasks();
  }
}

// Función para actualizar una tarea
async function updateTask(id, newTitle) {
  const response = await fetch(`${apiUrl}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: newTitle })
  });
  if (response.ok) {
    fetchTasks();
  }
}

// Función para editar la tarea mediante un prompt
function editTask(task) {
  const newTitle = prompt("Editar tarea:", task.title);
  if (newTitle) {
    updateTask(task.id, newTitle);
  }
}

// Manejador del formulario para agregar una nueva tarea
document.getElementById('task-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const title = document.getElementById('task-title').value;
  addTask(title);
  document.getElementById('task-title').value = '';
});

fetchTasks();