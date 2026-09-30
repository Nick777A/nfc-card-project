(function () {
  document.querySelectorAll('.dl-copy-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-url');
      var original = btn.textContent;
      function done(ok) {
        btn.textContent = ok ? '✓ Copied!' : 'Copy failed';
        btn.classList.toggle('is-copied', ok);
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('is-copied');
        }, 1500);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
      } else {
        var input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy'); done(true); } catch (e) { done(false); }
        document.body.removeChild(input);
      }
    });
  });
})();
