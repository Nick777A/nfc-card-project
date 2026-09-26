(function () {
  const form = document.getElementById('order-form');
  if (!form) return;

  const quantityInput = document.getElementById('quantity');
  const companyField = document.getElementById('company-field');
  const pricePerCardEl = document.getElementById('price-per-card');
  const priceQtyEl = document.getElementById('price-qty');
  const priceTotalEl = document.getElementById('price-total');

  function selectedValue(name) {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  }

  function syncChoiceStyles(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.dl-choice').forEach((label) => {
      const input = label.querySelector('input');
      label.classList.toggle('is-checked', !!(input && input.checked));
    });
  }

  function syncCompanyField() {
    companyField.style.display = selectedValue('kind') === 'organization' ? 'block' : 'none';
  }

  async function refreshPrice() {
    const quantity = Math.max(1, parseInt(quantityInput.value, 10) || 1);
    const design = selectedValue('design') || 'classic';
    try {
      const res = await fetch(`/order/price?quantity=${quantity}&design=${encodeURIComponent(design)}`);
      const data = await res.json();
      pricePerCardEl.textContent = `${data.pricePerCard.toFixed(2)}€`;
      priceQtyEl.textContent = data.quantity;
      priceTotalEl.textContent = `${data.total.toFixed(2)}€`;
    } catch (e) {
      pricePerCardEl.textContent = '—';
      priceQtyEl.textContent = '—';
      priceTotalEl.textContent = '—';
    }
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'kind') syncCompanyField();
    if (e.target.name === 'kind' || e.target.name === 'design') {
      syncChoiceStyles('kind-group');
      syncChoiceStyles('design-group');
    }
    if (e.target.name === 'design' || e.target.name === 'quantity') refreshPrice();
  });
  quantityInput.addEventListener('input', refreshPrice);

  syncCompanyField();
  syncChoiceStyles('kind-group');
  syncChoiceStyles('design-group');
  refreshPrice();
})();
