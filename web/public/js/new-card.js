(function () {
  const picker = document.getElementById('type-picker');
  const sections = document.querySelectorAll('.type-section');

  function updateVisibleSection() {
    const selected = picker.querySelector('input[name="type"]:checked').value;
    sections.forEach((section) => {
      section.classList.toggle('active', section.dataset.type === selected);
    });
  }

  picker.addEventListener('change', updateVisibleSection);
  updateVisibleSection();

  const slugInput = document.getElementById('slug');
  const slugPreview = document.getElementById('slug-preview');
  const base = slugPreview.textContent.replace(/\/u\/\.\.\.$/, '');
  slugInput.addEventListener('input', () => {
    const value = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || '...';
    slugPreview.textContent = `${base}/u/${value}`;
  });
})();
