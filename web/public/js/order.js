(function () {
  const form = document.getElementById('order-form');
  if (!form) return;

  const quantityInput = document.getElementById('quantity');
  const companyField = document.getElementById('company-field');
  const pricePerCardEl = document.getElementById('price-per-card');
  const priceQtyEl = document.getElementById('price-qty');
  const priceTotalEl = document.getElementById('price-total');

  const designCustomize = document.getElementById('design-customize');
  const designImageInput = document.getElementById('designImage');
  const designImageHint = document.getElementById('design-image-hint');
  const previewFront = document.getElementById('preview-front');
  const previewStickerImg = document.getElementById('preview-sticker-img');
  const previewName = document.getElementById('preview-name');
  const dragHint = document.getElementById('preview-drag-hint');
  const showNameCheckbox = document.getElementById('showName');
  const contactNameInput = document.getElementById('contactName');
  const companyInput = document.getElementById('company');
  const imagePosXInput = document.getElementById('imagePosX');
  const imagePosYInput = document.getElementById('imagePosY');

  const STICKER_SIZE = 52;
  let pos = { x: 50, y: 50 }; // percentage, used for both background-position (logo-print) and sticker travel range

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

  function syncPreviewName() {
    const name = (selectedValue('kind') === 'organization' ? companyInput.value : contactNameInput.value).trim();
    previewName.textContent = name || 'Your name';
    previewName.style.display = showNameCheckbox.checked ? 'block' : 'none';
  }

  function resetPreviewVisuals() {
    previewFront.style.backgroundImage = '';
    previewFront.classList.remove('has-bg-image');
    previewStickerImg.style.display = 'none';
    previewStickerImg.removeAttribute('src');
    pos = { x: 50, y: 50 };
    imagePosXInput.value = '50';
    imagePosYInput.value = '50';
  }

  function applyPosition() {
    const design = selectedValue('design');
    if (design === 'logo-print') {
      previewFront.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
    } else if (design === 'sticker') {
      const maxLeft = previewFront.clientWidth - STICKER_SIZE;
      const maxTop = previewFront.clientHeight - STICKER_SIZE;
      previewStickerImg.style.left = `${(pos.x / 100) * maxLeft}px`;
      previewStickerImg.style.top = `${(pos.y / 100) * maxTop}px`;
    }
    imagePosXInput.value = String(Math.round(pos.x));
    imagePosYInput.value = String(Math.round(pos.y));
  }

  function syncDesignCustomize() {
    const design = selectedValue('design');
    designCustomize.style.display = design === 'classic' ? 'none' : 'block';
    if (design === 'sticker') {
      designImageHint.textContent = 'This image is used for the sticker — drag it on the preview to position it.';
    } else if (design === 'logo-print') {
      designImageHint.textContent = 'This image is printed across the whole card — drag it on the preview to position it.';
    }
    previewFront.classList.toggle('draggable', design === 'logo-print' || design === 'sticker');
  }

  designImageInput.addEventListener('change', () => {
    const file = designImageInput.files && designImageInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const design = selectedValue('design');
    pos = { x: 50, y: 50 };

    if (design === 'logo-print') {
      previewFront.style.backgroundImage = `url(${url})`;
      previewFront.style.backgroundSize = 'cover';
      previewFront.classList.add('has-bg-image');
      previewStickerImg.style.display = 'none';
    } else if (design === 'sticker') {
      previewStickerImg.src = url;
      previewStickerImg.style.display = 'block';
      previewFront.style.backgroundImage = '';
      previewFront.classList.remove('has-bg-image');
    }
    applyPosition();
  });

  showNameCheckbox.addEventListener('change', syncPreviewName);
  contactNameInput.addEventListener('input', syncPreviewName);
  companyInput.addEventListener('input', syncPreviewName);

  // ---- Drag to reposition the uploaded image within the card bounds ----
  let dragging = false;
  let dragStart = null;

  function activeDragTarget() {
    const design = selectedValue('design');
    if (design === 'logo-print' && previewFront.classList.contains('has-bg-image')) return 'logo-print';
    if (design === 'sticker' && previewStickerImg.style.display === 'block') return 'sticker';
    return null;
  }

  function pointerPos(e) {
    return e.touches && e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
  }

  function startDrag(e) {
    const target = activeDragTarget();
    if (!target) return;
    dragging = true;
    dragStart = { ...pointerPos(e), x0: pos.x, y0: pos.y };
    previewFront.classList.add('dragging');
    e.preventDefault();
  }

  function moveDrag(e) {
    if (!dragging) return;
    const p = pointerPos(e);
    const rect = previewFront.getBoundingClientRect();
    const dxPct = ((p.x - dragStart.x) / rect.width) * 100;
    const dyPct = ((p.y - dragStart.y) / rect.height) * 100;
    pos.x = Math.max(0, Math.min(100, dragStart.x0 + dxPct));
    pos.y = Math.max(0, Math.min(100, dragStart.y0 + dyPct));
    applyPosition();
  }

  function endDrag() {
    dragging = false;
    previewFront.classList.remove('dragging');
  }

  previewFront.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  dragHint.addEventListener('pointerdown', (e) => e.stopPropagation());

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
    if (e.target.name === 'kind') {
      syncCompanyField();
      syncPreviewName();
    }
    if (e.target.name === 'kind' || e.target.name === 'design') {
      syncChoiceStyles('kind-group');
      syncChoiceStyles('design-group');
    }
    if (e.target.name === 'design') {
      resetPreviewVisuals();
      designImageInput.value = '';
      syncDesignCustomize();
    }
    if (e.target.name === 'design' || e.target.name === 'quantity') refreshPrice();
  });
  quantityInput.addEventListener('input', refreshPrice);

  syncCompanyField();
  syncChoiceStyles('kind-group');
  syncChoiceStyles('design-group');
  syncDesignCustomize();
  syncPreviewName();
  refreshPrice();
})();
