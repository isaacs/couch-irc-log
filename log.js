var couchapp = require('couchapp')
  , ddoc = {_id:'_design/logs', shows:{}, updates:{}, views:{}, lists:{}}

exports.app = ddoc

ddoc.language = "javascript"

ddoc.rewrites =
  [ { from: "/", to:"/_list/listRooms/rooms", method: "GET" }
  , { from: "/:room/", to:"/_list/listDates/dates", method: "GET" }
  , { from: "/:room/:date/", to:"/_list/listMessages/messages", method:"GET" }
  , { from: "/-/message/:message", to:"/../../:message", method:"GET" }
  ]

ddoc.views.rooms =
  { map : function (doc) {
      if (doc.type === "room") emit(doc._id, doc._id)
    }
  }

ddoc.lists.listRooms = function (doc, req) {
  var row
    , rooms = {}
  start({ headers: {"content-type":"text/html"}})
  send("<h1>rooms</h1> <ul>")
  while (row = getRow()) {
    if (row.value === "PM") continue
    send("<li><a href='/" + row.value.replace(/#/g, '').toLowerCase()
        + "'>"+row.value+"</a></li>")
  }
  send("</ul>")
}

// ddoc.views.dates = ddoc.views.rooms
// ddoc.lists.listDates = ddoc.lists.listRooms
// return

ddoc.views.dates =
  { map: function (doc) {
      if (!doc.when || !doc.where
         || 0 !== doc.where.indexOf("#")) return
      var w = new Date(doc.when)
      w = w.getUTCFullYear()
        + "-" + (w.getUTCMonth()+1)
        + "-" + w.getUTCDate()
      var i = w + (doc.where.replace(/#/g, '')).toLowerCase()
      var em = {}
      em[doc.where] = [w]
      emit(i, [em])
    }
  , reduce : function (keys, values) {
      var uniquekeys = []
        , em = {}
      // first flatten
      values.forEach(function (v) {
        if (v.forEach) {
          v.forEach(arguments.callee)
          return
        }
        // each value is a {$room:[$dates],...} collection
        Object.keys(v).forEach(function (room) {
          em[room] = em[room] || []
          v[room].forEach(function (date) {
            if (em[room].indexOf(date) === -1) em[room].push(date)
          })
        })
      })
      return em
    }
  }



ddoc.lists.listDates = function (head, req) {
  start({headers:{"content-type":"text/html"}})
  send("<h1><a href=/>rooms</a> ")
  if (req.query && req.query.room) send(req.query.room)
  send("</h1>")
  var dates = getRow().value
  if (!dates) {
    send("<p>nada")
    return
  }
  send("<ul>")
  var rooms = Object.keys(dates)
  if (req.query.room) rooms = rooms.filter(function (r) {
    return r.toLowerCase() === "#" + req.query.room.toLowerCase()
  })
  rooms.forEach(function (room) {
    dates[room].forEach(function (d) {
      send("<li><a href='/"+room.replace(/#/g, '').toLowerCase() + "/" +
           d+"/'>"+(req.query.room ? "" : room)+" "+d+"</a></li>")
    })
  })
}



ddoc.views.messages =
  { map: function (doc) {
      if (doc.type === "room") return
      emit(doc._id, doc)
    }
  }

ddoc.lists.listMessages = function (head, req) {
  start({headers:{"content-type":"text/html"}})
  var msg
    , startTime, startDate
    , end
  if (req.query.date) {
    startTime = + (new Date(req.query.date))
    end = startTime +(24*60*60*1000)
  } else {
    end = Date.now()
    startTime = end - (24*60*60*1000)
  }
  startDate = new Date(startTime)
  var h = "<h1><a href=/>rooms</a> "
        + (req.query.room ? "<a href='/"+(req.query.room)+"/'>"
                                 + req.query.room + "</a>"
                                 : "") + " "
        + startDate.getUTCFullYear() + "-"
        + (startDate.getUTCMonth() + 1) + "-"
        + startDate.getUTCDate() + "</h1>"
  send(h)
  var msgs = []
  while (msg = getRow()) {
    if (!msg.value) continue
    msg = msg.value
    if (!msg.when || !msg.where) continue
    if (req.query.room && msg.where.replace(/#/,'').toLowerCase()
         !== req.query.room.toLowerCase()) continue
    var d = msg.timestamp = new Date(msg.when).getTime()
    if (d < startTime || d > end) continue
    msgs.push(msg)
  }
  var out = ""
  msgs = msgs.sort(function (a, b) {
    return a.timestamp > b.timestamp ? 1 : -1
  })
  function sani (s, link) {
    if (!s) return ""
    s = s.replace(/&/g, '&amp;')
         .replace(/"/g, '&quot;')
         .replace(/</g, '&lt;')
    // if (link) s = s.replace(
    //   /\b((?:ftp|http):\/\/[\w\d_-]+(:?\.[\w\d_-]*)*(:?\/[^\?\s\#]*)?(:?\?[^\s\#]*)?(:?\#[^\s]*)?)/gi,
    //   '<a href="$1">$1</a>')
    return s
  }
  send("<style type=text/css>p { font-family:monospace; margin:0; padding:0;"
      + "position:relative; overflow:hidden; }"
      + "p a.l { text-decoration:none; color:inherit; display:block;"
      + " margin: -4em 0 0; padding: 4em 0 0; }"
      + "span.l { display:block; margin:0; padding:0;"
      + " padding:0 2ex 0 10ex ; text-indent:-10ex; background:#fff;"
      + " position:relative; }"
      + "p a.l:target span { background:#ffc }"
      + "p a.l:hover span { background:#eef }"
      + "p a.expand { position:absolute; right:1ex; top:0;"
      + " padding:0; margin:0; display:none; color:#eef;"
      + "}"
      + "p:hover a.expand { display:block; background:#cfc }"
      + ".PART, .QUIT, .JOIN { color: #ccc; text-align:center }"
      + "body { padding:0 0 5em }"
      + "html,body { width:100%; overflow-x:hidden }</style>")
  msgs.forEach(function (m) {
    var o = ""
//    if (req.query.room && req.query.room.match(/testing/)) {
//      return send( "<p>" + JSON.stringify(m) + "</p>" )
//    }
    if (m.command === "PRIVMSG") {
      o += new Date(m.when).toISOString().substr(11,8) + " "
    }
    if (!req.query.room) o += (m.where+" ")
    o += ("<b>"+sani(m.nick||m.user)+"</b>")
    if (m.what.indexOf("\u0001ACTION ") === 0) {
      m.what = m.what.substr("\u0001ACTION".length)
      m.what = m.what.substr(0, m.what.length - 1)
    } else o += ": "
    o += sani(m.what, true)
    o = "<p class='"+m.command+"'><a id='"+m._id
      + "' class=l name='"+m._id+"' href='#"+m._id+"'>"
      + "<span class=l>"+ o
      + "</span></a><a class=expand href='/-/message/"+m._id+"'>+</a></p>"
    send(o)
  })
}


ddoc.validate_doc_update = function (newDoc, oldDoc, user) {
  if (user.roles.indexOf("_admin") === -1) throw {forbidden:"admins only"}
}
