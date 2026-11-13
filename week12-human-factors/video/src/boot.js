// 폰트를 먼저 완전히 불러온 다음 장면 모듈을 불러온다 (캔버스 텍스처가 올바른 한글 글꼴로 그려지도록).
import { STR, CAPS } from './content.js';
(async () => {
  try {
    const all = CAPS.map((c) => c.text || '').join('') + JSON.stringify(STR) + '·÷=()';
    const weights = [400, 500, 700, 900];
    await Promise.all(weights.map((w) => document.fonts.load(`${w} 40px "Noto Sans KR"`, all)));
    await document.fonts.ready;
    const check = {};
    for (const w of weights) check[w] = document.fonts.check(`${w} 40px "Noto Sans KR"`, all);
    let loaded = 0; document.fonts.forEach((f) => { if (f.status === 'loaded') loaded++; });
    window.__fontReport = { check, loadedFaces: loaded };
    await import('./main.js');
  } catch (e) { window.__error = String((e && e.stack) || e); }
})();
