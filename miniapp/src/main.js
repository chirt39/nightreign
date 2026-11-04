import { createApp } from 'vue';
import hbSDK from '@heybox/hb-sdk';
import App from '../.generated-src/App.vue';
import { setupLocalSave } from './local-save.js';
import { setupMobileNav } from './mobile-nav.js';
import './styles.css';

const apiBase = (import.meta.env.VITE_NIGHTREIGN_API_BASE || '').trim();
if (apiBase) {
  const apiOrigin = new URL(apiBase).origin;
  window.nightreignMiniappApiFetch = async (input, options) => {
    const url = new URL(input);
    if (url.origin !== apiOrigin || url.protocol !== 'https:' || options.method !== 'POST'
      || !(url.pathname === '/api/feedback' || url.pathname.startsWith('/api/ai/'))) {
      throw new Error('小程序 API 请求地址无效。');
    }
    const result = await hbSDK.network.request({
      url: url.href,
      method: 'POST',
      headers: options.headers,
      data: JSON.parse(options.body),
      validateStatus: () => true,
    });
    return {
      status: result.status,
      ok: result.status >= 200 && result.status < 300,
      headers: new Headers(result.headers),
      json: async () => typeof result.data === 'string' ? JSON.parse(result.data) : result.data,
      text: async () => typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? ''),
    };
  };
}

document.body.classList.add('heybox-miniapp');
createApp(App).mount('#app');
setupLocalSave();
setupMobileNav();
