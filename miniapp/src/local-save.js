import hbSDK from '@heybox/hb-sdk';

const maximumBytes = 8 * 1024 * 1024;
const maximumCombinedBytes = 64 * 1024 * 1024;
const chunkNamePattern = /^(.+\.sl2)\.(\d{3,})-of-(\d{3,})\.part$/i;

function errorText(error) {
  if (error?.code === 'FILE_PICKER_CANCELLED') return '';
  if (['METHOD_FORBIDDEN', 'METHOD_NOT_FOUND'].includes(error?.code)) return '当前小黑盒客户端不支持文件选择，请升级客户端后重试。';
  return error?.message || String(error);
}

async function readSaveParts(files, hint) {
  if (!Array.isArray(files) || files.length < 2) {
    throw new Error('请选择同一存档的全部 .part 分片；分片文件名应类似 NR0000.sl2.001-of-002.part。');
  }

  const parts = files.map(file => {
    const match = typeof file?.name === 'string' ? file.name.match(chunkNamePattern) : null;
    if (!match) throw new Error('分片名称不符合格式。请用本机切片工具生成，并一次选择同一目录中的全部 .part 文件。');
    return { file, saveName: match[1], index: Number(match[2]), count: Number(match[3]), size: 0 };
  });

  const saveName = parts[0].saveName;
  if (parts.some(part => part.saveName.toLowerCase() !== saveName.toLowerCase())) {
    throw new Error('不能混选不同存档的分片，请重新选择同一存档的一整组文件。');
  }
  const expectedCount = parts[0].count;
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== parts.length || parts.some(part => part.count !== expectedCount)) {
    throw new Error('分片未选完整。请重新选择同一目录中的全部分片。');
  }

  parts.sort((left, right) => left.index - right.index);
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].index !== index + 1) {
      throw new Error('分片序号重复或不连续。请重新选择从 001 开始的全部分片，不要漏选。');
    }
  }

  let totalBytes = 0;
  for (const part of parts) {
    const stat = await part.file.stat();
    if (!Number.isSafeInteger(stat.size) || stat.size <= 0) {
      throw new Error(`分片 ${part.file.name} 的文件大小无效。`);
    }
    if (stat.size > maximumBytes) {
      throw new Error(`分片 ${part.file.name} 超过小黑盒单文件 8 MiB 读取上限，请按每片 7 MiB 重新切片。`);
    }
    part.size = stat.size;
    totalBytes += stat.size;
  }

  if (totalBytes > maximumCombinedBytes) {
    throw new Error('分片总大小超过当前设备 64 MiB 的端内拼接上限。');
  }

  let combined;
  try {
    combined = new Uint8Array(totalBytes);
  } catch {
    throw new Error('当前设备可用内存不足，无法拼接此存档。');
  }

  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    hint.textContent = `正在本地读取分片 ${index + 1}/${parts.length}…`;
    const bytes = await part.file.readBytes();
    if (bytes.byteLength !== part.size) {
      throw new Error(`分片 ${part.file.name} 读取不完整，请重新选择分片。`);
    }
    combined.set(bytes, offset);
    offset += bytes.byteLength;
  }

  return { name: saveName, bytes: combined };
}

async function parseSave(name, bytes, hint) {
  if (typeof window.readSave !== 'function') throw new Error('存档解析器尚未载入，请稍后再试。');
  const isWholeBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  const buffer = isWholeBuffer ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  hint.textContent = '正在当前设备解析存档…';
  await window.readSave({ name, arrayBuffer: async () => buffer });
  const saveStatus = document.querySelector('#save-status');
  if (saveStatus?.classList.contains('error')) throw new Error(saveStatus.textContent || '存档解析失败。');
  hint.textContent = '存档已在当前设备解析；原文件未修改，也没有上传。';
}

export function setupLocalSave() {
  const zone = document.querySelector('#drop-zone');
  if (!zone) return;
  zone.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'heybox-local-save panel';
  panel.innerHTML = '<strong>从当前设备读取</strong><p>不超过 8 MiB 的 .sl2 可直接导入。更大的存档先在电脑运行本机切片工具，按每片 7 MiB 切分，再一次多选全部 .part 文件，例如 NR0000.sl2.001-of-002.part；手机端请先把 .parts 文件夹复制到手机可访问的位置。分片只在本机拼回和解析，原档不修改、不上传。端内拼接上限为 64 MiB。</p><div class="heybox-save-actions"><button type="button" id="heybox-pick-sl2" disabled>直接导入 .sl2</button><button type="button" id="heybox-pick-chunks" disabled>导入存档分片</button><button type="button" id="heybox-pick-json" disabled>导入本地 JSON</button></div><p class="hint" id="heybox-save-hint" role="status" aria-live="polite">正在连接小黑盒文件能力…</p>';
  zone.after(panel);

  const direct = panel.querySelector('#heybox-pick-sl2');
  const chunks = panel.querySelector('#heybox-pick-chunks');
  const local = panel.querySelector('#heybox-pick-json');
  const hint = panel.querySelector('#heybox-save-hint');

  hbSDK.onHandshakeStateChange(state => {
    const ready = state.status === 'ready';
    direct.disabled = !ready;
    chunks.disabled = !ready;
    local.disabled = !ready;
    hint.textContent = ready ? '仅在当前设备读取与解析，不修改原文件。' : state.status === 'failed' ? '小黑盒文件能力连接失败，请重新打开小程序。' : '正在连接小黑盒文件能力…';
  });

  async function receive(mode, filesPromise) {
    try {
      const files = await filesPromise;
      if (!files?.length) return;

      if (mode === 'chunks') {
        const parsed = await readSaveParts(files, hint);
        await parseSave(parsed.name, parsed.bytes, hint);
        return;
      }

      const [file] = files;
      const stat = await file.stat();
      if (stat.size > maximumBytes) {
        throw new Error(mode === 'sl2' ? '此存档超过 8 MiB。请在电脑用本机切片工具按每片 7 MiB 切分，再选择全部 .part 分片导入。' : '导出数据超过 8 MiB，暂时无法导入。');
      }

      hint.textContent = '正在当前设备读取文件…';
      const bytes = await file.readBytes();
      if (bytes.byteLength > maximumBytes) throw new Error('文件超过小黑盒单文件 8 MiB 读取上限。');

      if (mode === 'sl2') {
        await parseSave(file.name, bytes, hint);
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
  chunks.addEventListener('click', () => receive('chunks', hbSDK.files.pickFiles({ mode: 'read', accept: ['.part'], multiple: true })));
  local.addEventListener('click', () => receive('json', hbSDK.files.pickFiles({ mode: 'read', accept: ['.json'] })));
}
