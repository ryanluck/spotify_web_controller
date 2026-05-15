var progressBar = {
	elemOuter: document.getElementById("progressbar-outer"),
	elemInner: document.getElementById("progressbar"),
	value: 0,
	hovering: false,

	setValue: function(value) {
		if (value < 0) {
			value = 0;
		}
		else if (value > 100) {
			value = 100;
		}

		progressBar.value = value;
		progressBar.elemInner.style.width = value+"%";
		progressBar.elemInner.setAttribute("value", value);
	},

	getValue: function() {
		return progressBar.value;
	},

	progressMouseEnter: function(e) {
		e=e || window.event;
		if ((e.which == 1 || e.type == "touchstart")) {
			progressBar.hovering = true;
			progressBar.elemInner.style.transition = "none";
			progressBar.elemInner.classList.add("hovering");
			window.addEventListener("mousemove", progressBar.progressMouseMove);
			window.addEventListener("touchmove", progressBar.progressMouseMove);
			window.addEventListener("mouseup", progressBar.progressMouseLeave);
			window.addEventListener("touchend", progressBar.progressMouseLeave);
			window.addEventListener("touchcancel", progressBar.progressMouseLeave);

			/* Cursor Styling */
			var css = '* { cursor: inherit !important; } body { cursor: w-resize !important; }';
			var head = document.head || document.getElementsByTagName('head')[0];
			var style = document.createElement('style');
			style.type = 'text/css';
			style.id = 'cursorstyling';
			if (style.styleSheet){
				style.styleSheet.cssText = css;
			}
			else {
				style.appendChild(document.createTextNode(css));
			}
			head.appendChild(style);
			progressBar.progressMouseMoveCalc(e);
		}
	},

	pauseEvent: function(e){
		if(e.stopPropagation) e.stopPropagation();
		if(e.preventDefault) e.preventDefault();
		e.cancelBubble=true;
		e.returnValue=false;
		return false;
	},

	progressMouseMove: function(e) {
		e=e || window.event;
		if (e.type != "touchstart" && e.type != "touchmove" && e.type != "touchend") {
			progressBar.pauseEvent(e);
		}
		progressBar.progressMouseMoveCalc(e);
	},

	progressMouseMoveCalc: function(e) {
		var rect = progressBar.elemOuter.getBoundingClientRect();
		var minX = rect.left + window.pageXOffset;
		var maxX = rect.right + window.pageXOffset;

		var x;
		if (e.type == "touchstart" || e.type == "touchmove" || e.type == "touchend") {
			x = e.changedTouches[0].pageX;
		}
		else {
			x = e.clientX + window.pageXOffset;
		}

		if (x <= minX) {
			progressBar.progressMouseSet(0);
		}
		else if (x >= maxX) {
			progressBar.progressMouseSet(100);
		}
		else {
			var progressPerc = ((x - minX) / (maxX - minX)) * 100;
			progressBar.progressMouseSet(progressPerc);
		}
	},

	progressMouseSet: function(val) {
		if (spotifyHandler.duration != 0) {
			progressBar.setValue(val);

			var timeToBeSet = (progressBar.getValue() / 100) * spotifyHandler.duration;
			spotifyHandler.updateTimes(timeToBeSet, spotifyHandler.duration);
		}
	},

	progressMouseLeave: function(e) {
		progressBar.hovering = false;
		progressBar.elemInner.style.transition = null;
		window.removeEventListener("mousemove", progressBar.progressMouseMove);
		window.removeEventListener("touchmove", progressBar.progressMouseMove);
		window.removeEventListener("mouseup", progressBar.progressMouseLeave);
		window.removeEventListener("touchend", progressBar.progressMouseLeave);
		window.removeEventListener("touchcancel", progressBar.progressMouseLeave);
		var cursorStyle = document.getElementById("cursorstyling");
		if (cursorStyle) cursorStyle.remove();
		progressBar.elemInner.classList.remove("hovering");
		progressBar.progressMouseMoveCalc(e);
		spotifyHandler.api.seek(Math.floor((progressBar.getValue() / 100) * (spotifyHandler.duration * 1000)), {});
		setTimeout(function() {
			spotifyHandler.setCurrentlyPlaying();
		}, 250);
	},

	init: function() {
		progressBar.elemOuter.addEventListener("mousedown", progressBar.progressMouseEnter);
		progressBar.elemOuter.addEventListener("touchstart", progressBar.progressMouseEnter);
	}
};

progressBar.init();
