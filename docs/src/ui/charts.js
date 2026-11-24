// FinancialChart: bar (grouped) and donut, inline SVG/CSS with legend, period/unit and an
// accessible table fallback. Values are passed in; no aggregation happens here.
(function (root) {
  'use strict';
  const UI = root.FFUI = root.FFUI || {};
  const { esc, vnd, compact } = UI.fmt;
  // Stable category colours shared by every chart and legend.
  const CATEGORY_COLORS = { food: '#2563EB', grocery: '#0F9F8F', kids: '#7C3AED', transport: '#0891B2', home: '#B45309', bills: '#CA8A04', health: '#DB2777', 'couple-allowance': '#65A30D', other: '#94A3B8', 'loan-payment': '#334155', salary: '#159A65', bonus: '#0F766E', business: '#2878D0', 'other-income': '#64748B', __group: '#CBD5E1' };
  const SERIES = { income: '#159A65', expense: '#D94848', neutral: '#334155', brand: '#EA8A00' };
  const colorOf = id => CATEGORY_COLORS[id] || CATEGORY_COLORS.other;

  function tableFallback(caption, head, rows) {
    return `<details class="chart-table"><summary>Xem bảng số liệu</summary><div class="table-wrap"><table class="table"><caption class="sr-only">${esc(caption)}</caption><thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => (i ? `<td class="num">${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  // series: [{key,label,color,values:[n], barAttrs?(i)->attrs}] labels: [x labels]
  function bar({ labels, series, caption, unit = 'Triệu đồng', height = 160, average = null, minColumn = 56, selected = null, id = '' }) {
    const max = Math.max(1, ...series.flatMap(s => s.values.map(v => Number(v) || 0)), average ? average.value : 0);
    const legend = `<ul class="chart-legend">${series.map(s => `<li><i style="background:${s.color}"></i>${esc(s.label)}</li>`).join('')}${average ? `<li><i class="legend-line"></i>${esc(average.label)}</li>` : ''}</ul>`;
    const cols = labels.map((label, i) => `<div class="bar-col${selected === i ? ' is-selected' : ''}"><div class="bar-stack" style="height:${height}px">${series.map(s => {
      const v = Number(s.values[i]) || 0, h = Math.round((v / max) * height), title = esc(s.label + ' ' + label + ': ' + vnd(v));
      const barHtml = `<span class="bar" style="height:${Math.max(v > 0 ? 2 : 0, h)}px;background:${s.color}"${s.barAttrs ? '' : ` title="${title}"`}><span class="bar-value">${esc(UI.state.hideAmounts ? '•••' : compact(v).replace(' tr', ''))}</span></span>`;
      // Interactive bars: the whole column height is the tap target (bar may be tiny or zero).
      return s.barAttrs ? `<button type="button" class="bar-hit"${UI.attrs(s.barAttrs(i))} title="${title}">${barHtml}</button>` : barHtml;
    }).join('')}</div><span class="bar-label">${esc(label)}</span></div>`).join('');
    const avg = average ? `<div class="bar-average" style="bottom:${Math.round((average.value / max) * height) + 28}px" aria-hidden="true"></div>` : '';
    const rows = labels.map((label, i) => [esc(label), ...series.map(s => esc(vnd(s.values[i])))]);
    return `<figure class="chart chart-bar"${id ? ` id="${esc(id)}"` : ''}><figcaption class="chart-meta"><span>${esc(caption)}</span><span class="muted">Đơn vị cột: ${esc(unit)}</span></figcaption>${legend}<div class="chart-scroll" tabindex="0" role="region" aria-label="${esc(caption)}"><div class="bar-plot" style="grid-template-columns:repeat(${labels.length},minmax(${minColumn}px,1fr));min-width:${labels.length * minColumn}px">${cols}${avg}</div></div>${tableFallback(caption, ['Kỳ', ...series.map(s => s.label)], rows)}</figure>`;
  }

  // segments: [{id,label,value}] — groups beyond maxSlices-1 into "Khác (gộp)".
  function donut({ segments, caption, centerLabel = 'Tổng', maxSlices = 7, legendAttrs = null }) {
    const rows = segments.filter(s => Number(s.value) > 0).sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    if (!total) return UI.c.emptyState({ title: 'Chưa có khoản chi', text: 'Biểu đồ sẽ hiện khi có khoản chi trong kỳ.' });
    let shown = rows;
    if (rows.length > maxSlices) { const head = rows.slice(0, maxSlices - 1), rest = rows.slice(maxSlices - 1); shown = [...head, { id: '__group', label: 'Khác (gộp ' + rest.length + ' danh mục)', value: rest.reduce((s, r) => s + Number(r.value), 0), grouped: rest }]; }
    const R = 60, C = 2 * Math.PI * R; let offset = 0;
    const arcs = shown.map(s => { const len = (s.value / total) * C; const el = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${colorOf(s.id)}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(s.label)}: ${esc(vnd(s.value))}</title></circle>`; offset += len; return el; }).join('');
    const pct = v => ((v / total) * 100).toFixed(1).replace('.', ',') + '%';
    const legend = `<ul class="donut-legend">${shown.map(s => { const a = legendAttrs && !s.grouped ? legendAttrs(s) : null; const inner = `<i style="background:${colorOf(s.id)}"></i><span class="dl-label">${esc(s.label)}</span><span class="dl-value">${esc(vnd(s.value))}</span><span class="dl-pct">${pct(s.value)}</span>`; return `<li>${a ? `<button type="button" class="dl-item"${UI.attrs(a)}>${inner}</button>` : `<span class="dl-item">${inner}</span>`}</li>`; }).join('')}</ul>`;
    return `<figure class="chart chart-donut"><figcaption class="sr-only">${esc(caption)}</figcaption><div class="donut-wrap"><svg viewBox="0 0 160 160" class="donut" role="img" aria-label="${esc(caption + ': ' + shown.map(s => s.label + ' ' + pct(s.value)).join(', '))}"><g transform="rotate(-90 80 80)">${arcs}</g></svg><div class="donut-center"><span>${esc(centerLabel)}</span><b class="money">${esc(compact(total))}</b></div></div>${legend}${tableFallback(caption, ['Danh mục', 'Số tiền', 'Tỷ trọng'], rows.map(r => [esc(r.label), esc(vnd(r.value)), pct(r.value)]))}</figure>`;
  }

  UI.chart = { bar, donut, CATEGORY_COLORS, SERIES, colorOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
