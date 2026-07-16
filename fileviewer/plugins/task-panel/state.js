import { reactive, markRaw } from 'vue'

let _nextId = 1

export function createTaskState() {
  return reactive({
    tasks: [],
    add({ component, data = {}, cancel = null }) {
      const task = reactive({
        id: _nextId++,
        status: 'running',
        errors: [],
        cancel,
        component: markRaw(component),
        data: reactive(data),
      })
      this.tasks.push(task)
      return task
    },
    remove(id) { this.tasks = this.tasks.filter(t => t.id !== id) },
    clearDone() { this.tasks = this.tasks.filter(t => t.status === 'running') },
    clearAll()  { this.tasks = [] },
  })
}
