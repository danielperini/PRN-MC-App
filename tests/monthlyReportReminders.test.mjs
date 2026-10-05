import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPLETE_STATUSES, isProfessional, shouldSubmit, reportMonths, requiredMonths, localDateKey } from '../backend/monthly-report-reminder-rules.mjs';

test('only active, verified professionals receive the scheduled reminder', () => {
  const professional = { role:'PROFISSIONAL', acesso_liberado:true, is_verified:true };
  assert.equal(isProfessional(professional), true);
  assert.equal(isProfessional({ ...professional, acesso_liberado:null }), false);
  assert.equal(isProfessional({ ...professional, is_verified:false }), false);
  assert.equal(isProfessional({ ...professional, role:'COORDENADOR' }), false);
  assert.equal(isProfessional({ ...professional, role:'ADMIN' }), false);
  assert.equal(shouldSubmit({ permission_must_submit_monthly_reports:false }), false);
});

test('approved report explicitly covering May and June satisfies both months', () => {
  assert.deepEqual(reportMonths({ ano:2026, mes_referencia:'Maio–Junho' }), ['2026-5','2026-6']);
  assert.deepEqual(reportMonths({ ano:2026, mes_referencia:'março' }), ['2026-3']);
  assert.deepEqual(reportMonths({ ano:2026, mes_referencia:'Maio/Junho' }), ['2026-5','2026-6']);
  assert.deepEqual(reportMonths({ ano:2026, mes_referencia:'Maio e qualquer coisa' }), []);
});

test('October reminder covers completed months through September', () => {
  const months = requiredMonths(new Date('2026-10-05T09:00:00-03:00'));
  assert.equal(months[0].label, 'Março/2026');
  assert.equal(months.at(-1).label, 'Setembro/2026');
  assert.equal(localDateKey(new Date('2026-10-05T06:00:00Z')), '2026-10-05');
  assert.equal(COMPLETE_STATUSES.has('APPROVED'), true);
  assert.equal(COMPLETE_STATUSES.has('RETURNED'), false);
});
