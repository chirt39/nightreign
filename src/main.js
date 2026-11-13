import { createApp } from 'vue';
import App from './App.vue';
import { forPattern } from './lib/battle-replay-map.js';

window.BattleReplayMap = { forPattern };
createApp(App).mount('#app');
