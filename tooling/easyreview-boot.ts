/** JSON inside an HTML script must also escape HTML's script terminator. */
export const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function bootScript(values: Record<string, unknown>): string {
  return '<script>' + Object.entries(values).map(([key, value]) => `window.${key}=${scriptJson(value)};`).join('') +
    'document.documentElement.dataset.easyreview="true";' +
    'try{if(window.__PN_THEME__&&!document.cookie.includes("easyreview-ink-v1=")){for(const k of ["plannotator-light-theme","plannotator-dark-theme","plannotator-color-theme"])document.cookie=k+"="+encodeURIComponent(window.__PN_THEME__)+";path=/;max-age=31536000;SameSite=Lax";document.cookie="easyreview-ink-v1=1;path=/;max-age=31536000;SameSite=Lax"}}catch(e){}' +
    'try{location.hash=window.__PN_SHARE_PAYLOAD__}catch(e){document.title="EASYREVIEW_BOOT_FAILED"}</script>\n';
}
