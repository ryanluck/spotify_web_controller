function stripTags(text) {
	var tmp = document.createElement("div");
	tmp.innerHTML = text;
	return tmp.textContent || tmp.innerText;
}

function getCookie(name) {
	var re = new RegExp(name + "=([^;]+)");
	var value = re.exec(document.cookie);
	return (value != null) ? decodeURIComponent(value[1]) : null;
}

function setCookie(name, value) {
	var date = new Date();
	date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
	document.cookie = name + "=" + value + "; expires=" + date.toUTCString() + "; path=/; SameSite=Strict";
}

function deleteCookie(name) {
	document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict";
}

function formatSeconds(seconds) {
	var s = Math.floor(seconds % 60);
	var m = Math.floor((seconds / 60) % 60);
	var u = Math.floor(((seconds / 60) / 60 ) % 60);
	if (u > 0 && m < 10) {
		m = '0' + m;
	}
	if (s < 10) {
		s = '0' + s;
	}
	if (u < 1) {
		return (m + ':' + s);
	}
	else if (u >= 1) {
		return (u + ':' + m + ':' + s);
	}
}

function getDeviceIcon(type) {
	switch (type) {
		case "smartphone":
			return "&#xe32c;";
		case "computer":
			return "&#xe30a;";
		case "speaker":
		case "avr":
			return "&#xe32d;";
		case "tv":
		case "stb":
			return "&#xe333;";
		case "gameconsole":
			return "&#xe30f;";
		case "castvideo":
		case "castaudio":
			return "&#xe307;";
		case "automobile":
			return "&#xe531;";
		case "audiodongle":
			return "&#xe60f;";
		case "unknown":
		default:
			return "&#xe337;";
	}
}