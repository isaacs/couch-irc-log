var couchapp = require('couchapp')
  , ddoc = {_id:'_design/logs', shows:{}, updates:{}, views:{}, lists:{}}

exports.app = ddoc

ddoc.language = "javascript"

ddoc.rewrites =
  [ { from: "/", to:"/_list/listRooms/rooms", method: "GET" }
  , { from: "/:room", to:"/_list/listDates/dates", method: "GET" }
  , { from: "/:room/:date/", to:"/_list/listMessages/messages", method:"GET" }
  ]

ddoc.views.rooms =
  { map : function (doc) {
      if (doc.type === "room") {
        emit(doc._id, doc._id)
      }
    }
  }
ddoc.lists.listRooms = function (doc, req) {
  var row
    , rooms = {}
  start({ headers: {"content-type":"text/html"}})
  send("<html><ul>")
  while (row = getRow()) {
    send("<li><a href='/" + row.value.replace(/#/g, '').toLowerCase()
        + "'>"+row.value+"</a></li>")
  }
  send("</ul>")
}


ddoc.views.dates =
  { map: function (doc) {
      if (!doc.when) return
      var w = new Date(doc.when)
      w = w.getUTCFullYear()
        + "-" + (w.getUTCMonth()+1)
        + "-" + w.getUTCDate()
      var i = w + (doc.where.replace(/#/g, '')).toLowerCase()
      emit(i, [{ date:w, room : doc.where }])
    }
  , reduce : function (keys, values) {
      var uniquekeys = []
        , em = []
      // first flatten
      values.forEach(function (v) {
        if (Array.isArray(v)) {
          v.forEach(arguments.callee)
          return
        }
        if (uniquekeys.indexOf(v.date+v.room) !== -1) return
        uniquekeys.push(v.date+v.room)
        em.push(v)
      })
      return em
    }
  }
ddoc.lists.listDates = function (head, req) {
  start({headers:{"content-type":"text/html"}})
  if (req.query.room) send("<h1>"+req.query.room+"</h1>")
  var dates = getRow().value
  if (!dates) {
    send("nada")
    return
  }
  ;(req.query.room
    ? dates.filter(function (d) {
        return d.room.toLowerCase() === "#"+req.query.room.toLowerCase()
      })
    : dates
  ).forEach(function (d) {
    send("<li><a href='/"+d.room.replace(/#/g, '').toLowerCase() + "/"+
         d.date+"/'>"+(req.query.room ? "" : d.room) + " "+d.date+"</a></li>")
  })
}

ddoc.views.messages =
  { map: function (doc) {
      if (doc.type !== "message") return
      emit(doc._id, doc)
    }
  }
ddoc.lists.listMessages = function (head, req) {
  start({headers:{"content-type":"text/html"}})
  var msg
    , startTime
    , end
  if (req.query.date) {
    startTime = + (new Date(req.query.date))
    end = startTime +(24*60*60*1000)
  } else {
    end = Date.now()
    startTime = end - (24*60*60*1000)
  }
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
  function sani (s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&gt;')
  }
  send("<style type=text/css>p { font-family:monospace;padding:0;"
      + " margin:0 0 0 10ex ; text-indent:-10ex }"
      + "html,body { width:100%; overflow-x:hidden }</style>")
  msgs.forEach(function (m) {
    // send(toJSON(m))
    var o = ""
    o += new Date(m.when).toISOString().substr(11,8) + " "
    if (!req.query.room) o += (m.where+" ")
    o += ("<b>"+sani(m.nick)+"</b>")
    if (m.what.indexOf("\u0001ACTION ") === 0) {
      m.what = m.what.substr("\u0001ACTION".length)
      m.what = m.what.substr(0, m.what.length - 1)
    } else o += ": "
    o += sani(m.what)
    o = "<p>"+o+"</p>"
    send(o)
  })
}
ddoc.validate_doc_update = function (newDoc, oldDoc, user) {
  if (user.roles.indexOf("_admin") === -1) throw {forbidden:"admins only"}
}
