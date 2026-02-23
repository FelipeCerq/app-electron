import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app').$nextTick(() => {
  window.api.onMainProcessMessage((message) => {
    console.log(message)
  })
})
