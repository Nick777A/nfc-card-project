(function () {
  var row = document.getElementById('review-star-row');
  if (!row) return;
  var stars = row.querySelectorAll('.dl-star');
  var googleUrl = row.getAttribute('data-google-url');
  var form = document.getElementById('review-feedback-form');
  var ratingInput = document.getElementById('review-rating-input');

  function highlight(value) {
    stars.forEach(function (s) {
      s.classList.toggle('is-filled', parseInt(s.getAttribute('data-value'), 10) <= value);
    });
  }

  stars.forEach(function (star) {
    var value = parseInt(star.getAttribute('data-value'), 10);
    star.addEventListener('mouseenter', function () { highlight(value); });
    star.addEventListener('click', function () {
      highlight(value);
      row.classList.add('is-locked');
      if (value >= 4 && googleUrl) {
        window.location.href = googleUrl;
        return;
      }
      ratingInput.value = value;
      form.style.display = '';
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  row.addEventListener('mouseleave', function () {
    if (!row.classList.contains('is-locked')) highlight(0);
  });
})();
