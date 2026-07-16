import { markRaw } from 'vue'
import DialogNameConflict from './DialogNameConflict.vue'

export function openConflictDialog(winMgr, conflicts) {
  return new Promise((resolve) => {
    winMgr.open({
      id: 'dialog:conflict',
      title: 'Name Conflict',
      icon: 'mdi-alert-outline',
      component: markRaw(DialogNameConflict),
      width: 500,
      height: 340,
      props: { conflicts, onResolve: resolve },
    })
  })
}
