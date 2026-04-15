import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import vuetify from './plugins/vuetify.js'
import i18n from './plugins/i18n.js'
import KeyboardPlugin from './plugins/keyboard/index.js'
import NotificationPlugin from './plugins/notification/index.js'
import AuthPlugin from './plugins/auth/index.js'
import ThemePlugin from './plugins/theme/index.js'
import FilePlugin from './plugins/file/index.js'
import UploadPlugin from './plugins/upload/index.js'
import WritePlugin from './plugins/write/index.js'
import ArchivePlugin from './plugins/archive/index.js'
import ViewerPlugin from './plugins/viewer/index.js'
import ActionsPlugin from './plugins/actions/index.js'

const app = createApp(App)
app.use(createPinia())
app.use(vuetify)
app.use(i18n)
app.use(KeyboardPlugin)
app.use(NotificationPlugin)
app.use(AuthPlugin)
app.use(ThemePlugin)
app.use(FilePlugin)
app.use(UploadPlugin)
app.use(WritePlugin)
app.use(ArchivePlugin)
app.use(ViewerPlugin)
app.use(ActionsPlugin)
app.mount('#app')
