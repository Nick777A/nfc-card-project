(function () {
  var enabledBox = document.getElementById('themeEnabled');
  var fields = document.getElementById('theme-fields');
  if (!enabledBox) return;

  var bgModeRadios = document.querySelectorAll('input[name="bgMode"]');
  var bgColor1 = document.querySelector('input[name="bgColor1"]');
  var bgColor2 = document.getElementById('bgColor2');
  var bgAngle = document.querySelector('input[name="bgAngle"]');
  var bgAngleWrap = document.getElementById('bgAngleWrap');
  var accentColor1 = document.querySelector('input[name="accentColor1"]');
  var accentColor2 = document.querySelector('input[name="accentColor2"]');
  var iconColor = document.querySelector('input[name="iconColor"]');
  var iconSize = document.getElementById('iconSize');
  var previewWrap = document.getElementById('theme-preview-wrap');
  var previewCard = document.getElementById('theme-preview-card');
  var presetButtons = document.querySelectorAll('.dl-theme-swatch');

  enabledBox.addEventListener('change', function () {
    fields.style.display = enabledBox.checked ? '' : 'none';
  });

  function syncGradientFields() {
    var isGradient = document.querySelector('input[name="bgMode"]:checked').value === 'gradient';
    bgColor2.style.display = isGradient ? '' : 'none';
    bgAngleWrap.style.display = isGradient ? '' : 'none';
  }

  function updatePreview() {
    if (!previewWrap || !previewCard) return;
    var isGradient = document.querySelector('input[name="bgMode"]:checked').value === 'gradient';
    var bg = isGradient
      ? 'linear-gradient(' + (bgAngle.value || 135) + 'deg, ' + bgColor1.value + ', ' + bgColor2.value + ')'
      : bgColor1.value;
    previewWrap.style.background = bg;
    var scale = iconSize.value === 'sm' ? 0.85 : iconSize.value === 'lg' ? 1.2 : 1;
    previewCard.style.setProperty('--u-accent1', accentColor1.value);
    previewCard.style.setProperty('--u-accent2', accentColor2.value);
    previewCard.style.setProperty('--u-icon-color', iconColor.value);
    previewCard.style.setProperty('--u-icon-scale', scale);
  }

  [bgColor1, bgColor2, bgAngle, accentColor1, accentColor2, iconColor].forEach(function (input) {
    if (input) input.addEventListener('input', updatePreview);
  });
  bgModeRadios.forEach(function (r) {
    r.addEventListener('change', function () { syncGradientFields(); updatePreview(); });
  });
  if (iconSize) iconSize.addEventListener('change', updatePreview);

  presetButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var preset = JSON.parse(btn.getAttribute('data-preset'));
      document.querySelector('input[name="bgMode"][value="' + preset.bgMode + '"]').checked = true;
      bgColor1.value = preset.bgColor1;
      bgColor2.value = preset.bgColor2;
      bgAngle.value = preset.bgAngle;
      accentColor1.value = preset.accentColor1;
      accentColor2.value = preset.accentColor2;
      iconColor.value = preset.iconColor;
      presetButtons.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      syncGradientFields();
      updatePreview();
    });
  });

  syncGradientFields();
  updatePreview();
})();
