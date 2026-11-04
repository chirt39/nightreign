import { createApp } from 'vue';
import App from '../.generated-src/App.vue';
import { setupLocalSave } from './local-save.js';
import { setupMobileNav } from './mobile-nav.js';
import './styles.css';

document.body.classList.add('heybox-miniapp');
createApp(App).mount('#app');
setupLocalSave();
setupMobileNav();
