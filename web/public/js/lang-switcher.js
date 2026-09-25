(function () {
  const select = document.getElementById('lang-select');
  if (!select) return;
  select.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', select.value);
    window.location.href = url.toString();
  });
})();
