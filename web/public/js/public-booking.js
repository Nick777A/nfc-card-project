(function () {
  var dayButtons = document.querySelectorAll('.dl-booking-day');
  if (!dayButtons.length) return;
  var slotGroups = document.querySelectorAll('.dl-booking-slot-group');
  var form = document.getElementById('booking-form');
  var dateInput = document.getElementById('booking-date-input');
  var timeInput = document.getElementById('booking-time-input');
  var selectedLabel = document.getElementById('booking-selected-label');

  dayButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      dayButtons.forEach(function (b) { b.classList.toggle('active', b === btn); });
      var date = btn.getAttribute('data-date');
      slotGroups.forEach(function (g) { g.style.display = g.getAttribute('data-date') === date ? '' : 'none'; });
      form.style.display = 'none';
      document.querySelectorAll('.dl-booking-slot').forEach(function (s) { s.classList.remove('active'); });
    });
  });

  document.querySelectorAll('.dl-booking-slot').forEach(function (slotBtn) {
    slotBtn.addEventListener('click', function () {
      document.querySelectorAll('.dl-booking-slot').forEach(function (s) { s.classList.remove('active'); });
      slotBtn.classList.add('active');
      var group = slotBtn.closest('.dl-booking-slot-group');
      var date = group.getAttribute('data-date');
      var time = slotBtn.getAttribute('data-time');
      dateInput.value = date;
      timeInput.value = time;
      selectedLabel.textContent = date + ' — ' + time;
      form.style.display = '';
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
})();
