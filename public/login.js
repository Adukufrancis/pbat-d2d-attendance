import { $, api } from '/common.js';

const form = $('#login');
$('#password').focus();
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', form); btn.disabled = true;
  const { ok, data } = await api('/api/admin/login', { password: $('#password').value });
  btn.disabled = false;
  if (ok) return location.reload();
  $('#err').hidden = false; $('#err').textContent = data.error || 'Something went wrong.';
  $('#password').select();
});
