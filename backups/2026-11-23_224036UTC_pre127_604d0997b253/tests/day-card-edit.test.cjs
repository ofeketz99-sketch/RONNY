'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'scripts/src/10-days-groups.js'),'utf8');
const html=source.slice(source.indexOf('function renderDays(){'),source.indexOf('function dayColorChooserMarkup(',source.indexOf('function renderDays(){')));
test('each day card keeps independent selection and edit buttons',()=>{
 assert.ok(html.includes('<div class="ronny-day-card"><button type="button" draggable="true" class="day-pill'));
 assert.ok(html.includes('</button><button type="button" class="ronny-day-card-edit" data-day-edit='));
 assert.ok(html.includes('aria-label="ערוך את יום'));
 assert.ok(html.includes("el.onclick=()=>selectDay(+el.dataset.day)"));
 assert.ok(html.includes('if(selectedDay===dayIndex)editDay()'));
});
test('day edit control does not remove drag reorder or normal day selection',()=>{
 assert.ok(html.includes("addEventListener('dragstart'"));
 assert.ok(html.includes("addEventListener('drop'"));
 assert.ok(html.includes('event.stopPropagation()'));
 assert.ok(html.includes("if(dayIndex!==selectedDay||planningResolution!=='day')selectDay(dayIndex)"));
});
