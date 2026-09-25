(function () {
  const deleteForm = document.getElementById('delete-card-form');
  if (deleteForm) {
    deleteForm.addEventListener('submit', (e) => {
      if (!confirm('Удалить карточку? Она попадёт в Корзину и будет доступна для восстановления 30 дней. Физическая NFC-метка при этом сразу перестанет открывать её содержимое.')) {
        e.preventDefault();
      }
    });
  }

  const payload = document.getElementById('payload-text').textContent;
  const copyBtn = document.getElementById('copy-btn');
  const writeBtn = document.getElementById('nfc-write-btn');
  const statusEl = document.getElementById('nfc-status');
  const unsupportedEl = document.getElementById('nfc-unsupported');

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(payload);
      copyBtn.textContent = 'Скопировано!';
      setTimeout(() => (copyBtn.textContent = 'Скопировать'), 1500);
    } catch (e) {
      statusEl.textContent = 'Не удалось скопировать автоматически, выделите текст вручную.';
    }
  });

  const isUrl = /^https?:\/\//i.test(payload);

  if ('NDEFReader' in window) {
    writeBtn.style.display = 'inline-block';
    unsupportedEl.style.display = 'none';

    writeBtn.addEventListener('click', async () => {
      statusEl.textContent = 'Поднесите пустую NFC-карту к задней панели телефона...';
      writeBtn.disabled = true;
      try {
        const reader = new NDEFReader();
        const records = isUrl
          ? [{ recordType: 'url', data: payload }]
          : [{ recordType: 'text', data: payload }];
        await reader.write({ records });
        statusEl.textContent = '✅ Записано на карту успешно!';
      } catch (err) {
        statusEl.textContent = `Не удалось записать: ${err.message || err}. Попробуйте ещё раз.`;
      } finally {
        writeBtn.disabled = false;
      }
    });
  } else {
    writeBtn.style.display = 'none';
    unsupportedEl.style.display = 'block';
  }
})();
