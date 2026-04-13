import express from 'express';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'tasks.json');

app.use(express.json());
app.use(express.static('public'));

// Función auxiliar para leer las tareas desde el fichero JSON
async function readTasks() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // Si el fichero no existe o hay error, se retorna un array vacío
    return [];
  }
}

// Función auxiliar para escribir las tareas en el fichero JSON
async function writeTasks(tasks) {
  await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2));
}

// Endpoint para obtener todas las tareas
app.get('/api/tasks', async (req, res) => {
  const tasks = await readTasks();
  res.json(tasks);
});

// Endpoint para agregar una nueva tarea
app.post('/api/tasks', async (req, res) => {
  const newTask = req.body;
  if (!newTask.title) {
    return res.status(400).json({ error: "El título de la tarea es obligatorio" });
  }
  let tasks = await readTasks();
  // Se asigna un id único a la tarea (usando la marca de tiempo)
  newTask.id = Date.now().toString();
  tasks.push(newTask);
  await writeTasks(tasks);
  res.status(201).json(newTask);
});

// Endpoint para actualizar una tarea existente
app.put('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const updatedTask = req.body;
  let tasks = await readTasks();
  const index = tasks.findIndex(task => task.id === taskId);
  if (index === -1) {
    return res.status(404).json({ error: "Tarea no encontrada" });
  }
  tasks[index] = { ...tasks[index], ...updatedTask };
  await writeTasks(tasks);
  res.json(tasks[index]);
});

// Endpoint para eliminar una tarea
app.delete('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  let tasks = await readTasks();
  const index = tasks.findIndex(task => task.id === taskId);
  if (index === -1) {
    return res.status(404).json({ error: "Tarea no encontrada" });
  }
  const removedTask = tasks.splice(index, 1)[0];
  await writeTasks(tasks);
  res.json(removedTask);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});