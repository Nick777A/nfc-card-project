(function () {
  const input = document.getElementById('search-input');
  if (!input) return;
  const rows = document.querySelectorAll('#cards-table tbody tr');

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    rows.forEach((row) => {
      const haystack = row.dataset.search || '';
      row.style.display = haystack.includes(query) ? '' : 'none';
    });
  });
})();
