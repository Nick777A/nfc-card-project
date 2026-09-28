(function () {
  var tabs = document.querySelectorAll('.claim-method-tab');
  var methodInput = document.getElementById('claim-method-input');
  var emailField = document.querySelector('.claim-field-email');
  var phoneField = document.querySelector('.claim-field-phone');
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  if (!tabs.length) return;
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var method = tab.getAttribute('data-method');
      tabs.forEach(function (t2) { t2.classList.toggle('active', t2 === tab); });
      methodInput.value = method;
      if (method === 'phone') {
        emailField.style.display = 'none';
        phoneField.style.display = '';
        emailInput.required = false;
        phoneInput.required = true;
      } else {
        emailField.style.display = '';
        phoneField.style.display = 'none';
        emailInput.required = true;
        phoneInput.required = false;
      }
    });
  });
})();
