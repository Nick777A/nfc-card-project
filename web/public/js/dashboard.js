(function () {
  const input = document.getElementById('search-input');
  const rows = document.querySelectorAll('#cards-table tbody tr');

  if (input) {
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      rows.forEach((row) => {
        const haystack = row.dataset.search || '';
        row.style.display = haystack.includes(query) ? '' : 'none';
      });
    });
  }

  const printBtn = document.getElementById('print-selected-btn');
  const checkboxes = document.querySelectorAll('.card-checkbox');
  if (!printBtn || checkboxes.length === 0) return;

  function updatePrintButton() {
    const selected = Array.from(checkboxes).filter((cb) => cb.checked);
    printBtn.disabled = selected.length === 0;
  }

  checkboxes.forEach((cb) => cb.addEventListener('change', updatePrintButton));

  printBtn.addEventListener('click', () => {
    const ids = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    if (ids.length === 0) return;
    window.location.href = `/admin/print?ids=${ids.join(',')}`;
  });
})();
