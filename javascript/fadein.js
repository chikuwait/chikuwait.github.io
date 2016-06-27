$(document).ready(function() {

    $('body').fadeIn(2000);
    $("#fakeloader").fakeLoader();
    $('#fullpage').fullpage({
        'navigation': true,
        sectionsColor: ['#e7468b', '#E91E63', '#a31652', '#741539', '#722739'],
    });
});
$('head').append(
    '<style type="text/css">body {display:none;}'
);
$(window).load(function() {
    $('body').delay(600).fadeIn("2000");
});
