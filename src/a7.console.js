a7.console = (function() {
  "use strict";

  var title = "Console Window",
    // the div we'll create to host the console content
    consoleDiv,
    // flag whether console is running
    active = false,
    _addMessage = function(message, dt, source, level) {
      var div = document.createElement("div");
      div.setAttribute("class", "a7-console-row-" + source);
      if (level !== undefined) {
        div.innerHTML = level + ": ";
        div.setAttribute(
          "class",
          div.getAttribute("class") + " a7-console-row-" + level
        );
      }
      div.innerHTML +=
        +(dt.getHours() < 10 ? "0" + dt.getHours() : dt.getHours()) +
        ":" +
        (dt.getMinutes() < 10 ? "0" + dt.getMinutes() : dt.getMinutes()) +
        ": " +
        message;
      consoleDiv.appendChild(div);
    };

  return {
    init: function(resolve, reject) {
      var console = a7.model.get("a7.console");
      if( console.container === "" ) reject( "You must specify a container object for the console display." );
      
      // check for console state
      if ( console.enabled ) {
        active = true;
        consoleDiv = document.createElement("div");
        consoleDiv.setAttribute("id", "consoleDiv");
        consoleDiv.setAttribute("class", "a7-console");
        document.body.append(consoleDiv);
      var connection,
          fp = a7.components.Constructor(
            console.container,
            [
              consoleDiv,
              {
                width: console.width,
                left: console.left,
                height: console.height,
                title: title,
                top: console.top,
                enableShrink: false,
                enableClose: true
              }
            ],
            false
          );

        fp.selector.setAttribute("right", 0);

        window.WebSocket = window.WebSocket || window.MozWebSocket;

        // if browser doesn't support WebSocket, just show some
        // notification and exit
        if (!window.WebSocket) {
          consoleDiv.innerHTML("Your browser doesn't support WebSockets.");
          return;
        }

        // open connection
        connection = new WebSocket(console.wsServer);

        connection.onopen = function() {
          //a7.log.info( "Console initializing..." );
        };

        connection.onerror = function() {
          var message = "Can't connect to the console socket server.";
          if (console.enabled) {
            // just in there were some problems with conenction...
            _addMessage(message, new Date(), "local");
          } else {
            a7.log.error(message);
          }
        };

        // most important part - incoming messages
        connection.onmessage = function(message) {
          var json, ix;
          // try to parse JSON message. Because we know that the
          // server always returns
          // JSON this should work without any problem but we should
          // make sure that
          // the massage is not chunked or otherwise damaged.
          try {
            json = JSON.parse(message.data);
          } catch (er) {
            a7.log.error("This doesn't look like valid JSON: ", message.data);
            return;
          }

          if (json.type === "history") {
            // entire message
            // history
            // insert every single message to the chat window
            for (ix = 0; ix < json.data.length; ix++) {
              _addMessage(
                json.data[ix].text,
                new Date(json.data[ix].time),
                "websocket"
              );
            }
          } else if (json.type === "message") {
            // it's a single
            // message
            _addMessage(json.data.text, new Date(json.data.time), "websocket");
          } else {
            a7.log.error("This doesn't look like valid JSON: ", json);
          }
        };

        window.addEventListener("close", function() {
          connection.close();
        });

        a7.console.addMessage = _addMessage;
        a7.log.info("Console initializing...");
        resolve();
      } else {
        // console init should not run if console is set to false
        reject(
          "Console init should not be called when console option is set to false."
        );
      }
    }
  };
})();
