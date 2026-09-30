(function () {
  var externalRadio = document.getElementById('reviewModeExternal');
  var internalRadio = document.getElementById('reviewModeInternal');
  var urlField = document.getElementById('reviewUrlField');
  if (!externalRadio || !internalRadio || !urlField) return;

  function sync() {
    urlField.style.display = internalRadio.checked ? 'none' : '';
  }
  externalRadio.addEventListener('change', sync);
  internalRadio.addEventListener('change', sync);
})();
