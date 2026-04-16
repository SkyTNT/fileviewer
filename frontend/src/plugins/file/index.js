import DirectoryTree   from './components/DirectoryTree.vue'
import FileDetail      from './components/FileDetail.vue'
import ExplorerToolbar from './components/ExplorerToolbar.vue'
import WaterfallView   from './components/WaterfallView.vue'
import ListView        from './components/ListView.vue'
import RootsView       from './components/RootsView.vue'

export default {
  install(app) {
    app.component('DirectoryTree',   DirectoryTree)
    app.component('FileDetail',      FileDetail)
    app.component('ExplorerToolbar', ExplorerToolbar)
    app.component('WaterfallView',   WaterfallView)
    app.component('ListView',        ListView)
    app.component('RootsView',       RootsView)
  },
}
