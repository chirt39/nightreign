import hbSDK from '@heybox/hb-sdk';

const maximumBytes = 8 * 1024 * 1024;

function errorText(error) {
  if (error?.code === 'FILE_PICKER_CANCELLED') return '';
  if (['METHOD_FORBIDDEN', 'METHOD_NOT_FOUND'].includes(error?.code)) return '当前小黑盒客户端不支持文件选择，请升级客户端后重试。';
  return error?.message || String(error);
}

export function setupLocalSave() {
  const zone = document.querySelector('#drop-zone');
  if (!zone) return;
  zone.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'heybox-local-save panel';
  panel.innerHTML = '<strong>从当前设备读取</strong><p>小于 8 MiB 的 .sl2 可直接导入。较大的存档请先在原网站本地解析，导出小程序数据 JSON 后在这里导入。文件不会上传。</p><div class="heybox-save-actions"><button type="button" id="heybox-pick-sl2" disabled>直接导入 .sl2</button><button type="button" id="heybox-pick-json" disabled>导入本地 JSON</button></div><p class="hint" id="heybox-save-hint" role="status" aria-live="polite">正在连接小黑盒文件能力…</p>';
  zone.after(panel);
  const direct = panel.querySelector('#heybox-pick-sl2');
  const local = panel.querySelector('#heybox-pick-json');
  const hint = panel.querySelector('#heybox-save-hint');
  hbSDK.onHandshakeStateChange(state => {
    const ready = state.status === 'ready';
    direct.disabled = !ready;
    local.disabled = !ready;
    hint.textContent = ready ? '仅在当前设备解析，不修改原文件。' : state.status === 'failed' ? '小黑盒文件能力连接失败，请重新打开小程序。' : '正在连接小黑盒文件能力…';
  });
  async function receive(mode, filesPromise) {
    try {
      const [file] = await filesPromise;
      const stat = await file.stat();
      if (stat.size > maximumBytes) {
        throw new Error(mode === 'sl2' ? '此存档超过 8 MiB。请在原网站读取它，使用“导出小程序本地数据”生成 JSON 后导入。' : '导出数据超过 8 MiB，暂时无法导入。');
      }
      const bytes = await file.readBytes();
      if (bytes.byteLength > maximumBytes) throw new Error('文件超过 8 MiB 上限。');
      if (mode === 'sl2') {
        if (typeof window.readSave !== 'function') throw new Error('存档解析器尚未载入，请稍后再试。');
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        await window.readSave({ name: file.name, arrayBuffer: async () => buffer });
        const saveStatus = document.querySelector('#save-status');
        if (saveStatus?.classList.contains('error')) throw new Error(saveStatus.textContent || '存档解析失败。');
        hint.textContent = '原始存档已在当前设备解析，没有上传。';
      } else {
        if (typeof window.nightreignLoadTransfer !== 'function') throw new Error('图鉴资料尚未载入，请稍后再试。');
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        window.nightreignLoadTransfer(payload);
        hint.textContent = '本地遗物与战绩导入完成。';
      }
    } catch (error) {
      hint.textContent = errorText(error);
    }
  }
  direct.addEventListener('click', () => receive('sl2', hbSDK.files.pickFiles({ mode: 'read', accept: ['.sl2'] })));
  local.addEventListener('click', () => receive('json', hbSDK.files.pickFiles({ mode: 'read', accept: ['.json'] })));
}
