import { defineStore } from 'pinia'
import { ref, reactive, markRaw } from 'vue'

let _nextId = 1

export const useTaskStore = defineStore('task', () => {
  const tasks = ref([])

  /** Register a new task. Returns the reactive task object for the caller to update. */
  function add({ component, data = {}, cancel = null }) {
    const task = reactive({
      id: _nextId++,
      status: 'running',   // 'running' | 'done' | 'error'
      errors: [],
      cancel,
      component: markRaw(component),
      data: reactive(data),
    })
    tasks.value.push(task)
    return task
  }

  function remove(id) {
    tasks.value = tasks.value.filter(t => t.id !== id)
  }

  function clearDone() {
    tasks.value = tasks.value.filter(t => t.status === 'running')
  }

  function clearAll() {
    tasks.value = []
  }

  return { tasks, add, remove, clearDone, clearAll }
})
