(function () {
  var enabledBox = document.getElementById('themeEnabled');
  var fields = document.getElementById('theme-fields');
  var bgModeRadios = document.querySelectorAll('input[name="bgMode"]');
  var bgColor2 = document.getElementById('bgColor2');
  var bgAngleWrap = document.getElementById('bgAngleWrap');
  if (!enabledBox) return;

  enabledBox.addEventListener('change', function () {
    fields.style.display = enabledBox.checked ? '' : 'none';
  });

  function syncGradientFields() {
    var isGradient = document.querySelector('input[name="bgMode"]:checked').value === 'gradient';
    bgColor2.style.display = isGradient ? '' : 'none';
    bgAngleWrap.style.display = isGradient ? '' : 'none';
  }
  bgModeRadios.forEach(function (r) { r.addEventListener('change', syncGradientFields); });
})();
