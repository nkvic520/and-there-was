import type { ArtSelection, SceneAsset } from '@and-there-was/scene';
import { assetName, clearLabel, label, localize, translate } from './i18n';

type Api = <T>(path: string, body?: unknown) => Promise<T>;

export async function artPicker(worldId: string, mount: HTMLElement, api: Api) {
  const health = await api<{ imagesConfigured: boolean; mode: string }>('/api/health');
  const fixture = health.mode === 'fixture';
  const key = `art:${worldId}`;
  let selection: ArtSelection = { artSource: health.imagesConfigured && !fixture ? 'seedream' : 'library', assetIds: [], allowUploadReferences: false };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved && ['seedream','library'].includes(saved.artSource)) selection = saved;
  } catch { /* Ignore invalid preferences from a previous tab. */ }
  let assets: SceneAsset[] = [];
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = 'art-trigger'; trigger.className = 'art-trigger';
  const triggerName = document.createElement('span'), count = document.createElement('span');
  trigger.append(triggerName, count, ' ▾');
  mount.append(trigger);
  const dialog = document.createElement('dialog');
  dialog.className = 'art-picker';
  dialog.setAttribute('aria-labelledby', 'art-heading');
  dialog.innerHTML = `
    <div class="art-heading"><h2 id="art-heading" data-i18n="artHeading"></h2><button type="button" class="art-close" data-i18n="done" data-i18n-aria="artDone"></button></div>
    <div class="art-options">
      <label><input type="radio" name="art-source" value="seedream"> <strong data-i18n="aiArt"></strong><span data-i18n="aiDetail"></span></label>
      <label><input type="radio" name="art-source" value="library"> <strong data-i18n="library"></strong><span data-i18n="libraryDetail"></span></label>
    </div>
    <p class="art-note"></p><p data-i18n="${fixture ? 'assetExample' : 'artHelp'}"></p>
    <div class="asset-grid" data-i18n-aria="available"></div>
    <form class="upload-form">
      <h3 data-i18n="uploadHeading"></h3><p data-i18n="uploadInfo"></p>
      <label><span data-i18n="chooseFile"></span><input type="file" accept="image/png,image/jpeg,image/webp" required></label>
      <div class="upload-fields">
        <label><span data-i18n="artName"></span><input name="name" maxlength="120" data-i18n-placeholder="nameHint" required></label>
        <label><span data-i18n="role"></span><select name="role">
          <option value="character" data-i18n="character"></option><option value="background" data-i18n="background"></option><option value="illustration" data-i18n="illustration"></option>
        </select></label>
        <button type="submit" data-i18n="upload"></button>
      </div><small data-i18n="fileRules"></small>
    </form>
    <label class="reference-consent" hidden><input type="checkbox"> <span data-i18n="consent"></span></label><p class="art-feedback" role="status"></p>`;
  document.body.append(dialog);
  localize(dialog);
  const grid = dialog.querySelector<HTMLElement>('.asset-grid')!, note = dialog.querySelector<HTMLElement>('.art-note')!;
  const feedback = dialog.querySelector<HTMLElement>('.art-feedback')!, consent = dialog.querySelector<HTMLLabelElement>('.reference-consent')!;
  const consentInput = consent.querySelector<HTMLInputElement>('input')!;

  function save() {
    const ai = selection.artSource === 'seedream';
    const selectedUpload = assets.some(a => a.source === 'upload' && selection.assetIds?.includes(a.imageId));
    if (!ai || !selectedUpload) selection.allowUploadReferences = false;
    localStorage.setItem(key, JSON.stringify(selection));
    label(triggerName, ai ? 'aiArt' : 'library');
    count.textContent = selection.assetIds?.length ? ` (${selection.assetIds.length})` : '';
    for (const radio of dialog.querySelectorAll<HTMLInputElement>('[name="art-source"]')) radio.checked = radio.value === selection.artSource;
    label(note, ai ? (health.imagesConfigured ? 'aiNote' : 'aiMissing') : 'libraryNote');
    consent.hidden = !ai || !selectedUpload;
    consentInput.checked = !!selection.allowUploadReferences;
  }

  async function refresh() {
    assets = await api<SceneAsset[]>(`/api/worlds/${worldId}/images`);
    selection.assetIds = (selection.assetIds ?? []).filter(id => assets.some(a => a.imageId === id));
    grid.replaceChildren();
    for (const asset of assets) {
      const card = document.createElement('label'); card.className = 'asset-card';
      const box = document.createElement('input'); box.type = 'checkbox'; box.value = asset.imageId;
      box.checked = selection.assetIds.includes(asset.imageId);
      const img = document.createElement('img'); img.src = `/api/images/${asset.hash}`; img.alt = ''; img.loading = 'lazy';
      const name = document.createElement('span'), credit = document.createElement('small');
      const nameKey = assetName(asset);
      if (nameKey) {
        label(name, nameKey);
        box.dataset.i18nAria = nameKey;
        box.setAttribute('aria-label', translate(nameKey));
      } else {
        name.textContent = asset.name;
        box.setAttribute('aria-label', asset.name);
      }
      if (asset.source === 'upload') label(credit, 'myArt');
      else credit.textContent = asset.credit;
      box.onchange = () => {
        const ids = new Set(selection.assetIds);
        if (box.checked) ids.add(asset.imageId); else ids.delete(asset.imageId);
        if (ids.size > 16) { box.checked = false; label(feedback, 'maxAssets'); return; }
        selection.assetIds = [...ids]; selection.allowUploadReferences = false; save();
      };
      card.append(box, img, name, credit); grid.append(card);
    }
    save();
  }
  for (const radio of dialog.querySelectorAll<HTMLInputElement>('[name="art-source"]')) {
    radio.onchange = () => {
      selection.artSource = radio.value as ArtSelection['artSource'];
      selection.allowUploadReferences = false; save();
    };
  }
  consentInput.onchange = () => { selection.allowUploadReferences = consentInput.checked; save(); };
  dialog.querySelector<HTMLButtonElement>('.art-close')!.onclick = () => dialog.close();
  trigger.onclick = () => {
    clearLabel(feedback); dialog.showModal();
    void refresh().catch(() => label(feedback, 'retryLater'));
  };
  const form = dialog.querySelector<HTMLFormElement>('.upload-form')!, fileInput = form.querySelector<HTMLInputElement>('[type="file"]')!;
  const name = form.querySelector<HTMLInputElement>('[name="name"]')!;
  fileInput.onchange = () => { if (!name.value) name.value = (fileInput.files?.[0]?.name ?? '').replace(/\.[^.]+$/, '').slice(0,120); };
  form.onsubmit = async event => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024 || (file.type && !['image/jpeg','image/webp','image/png'].includes(file.type))) {
      label(feedback, 'fileRules'); return;
    }
    const button = form.querySelector<HTMLButtonElement>('button')!;
    button.disabled = true; label(feedback, 'saving');
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const asset = await api<SceneAsset>(`/api/worlds/${worldId}/images`, { name: name.value, role: form.querySelector<HTMLSelectElement>('[name="role"]')!.value, dataBase64: data });
      selection.artSource = 'library';
      selection.assetIds = [...(selection.assetIds ?? []).slice(0,15), asset.imageId];
      selection.allowUploadReferences = false;
      await refresh(); form.reset(); label(feedback, 'saved');
    } catch { label(feedback, 'uploadFailed'); }
    finally { button.disabled = false; }
  };
  await refresh();
  return { fixture, selection: () => structuredClone(selection) };
}
