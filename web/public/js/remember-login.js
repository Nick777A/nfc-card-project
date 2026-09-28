(function () {
  var KEY = 'digilama_last_identifier';
  var input = document.getElementById('email');
  if (!input) return;
  try {
    var saved = localStorage.getItem(KEY);
    if (saved && !input.value) input.value = saved;
  } catch (e) {}

  var form = input.closest('form');
  if (!form) return;
  form.addEventListener('submit', function () {
    try {
      var phoneInput = document.getElementById('phone');
      var usingPhone = phoneInput && phoneInput.offsetParent !== null && phoneInput.value.trim();
      var value = usingPhone ? phoneInput.value.trim() : input.value.trim();
      if (value) localStorage.setItem(KEY, value);
    } catch (e) {}
  });
})();
