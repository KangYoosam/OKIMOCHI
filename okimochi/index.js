require('dotenv').config({path: '../.env'});
const winston = require('winston');
const Botkit = require("botkit");
const config = require("./config");
const debug = require('debug')('okimochi');
const sync_request = require('sync-request');
const plotly = require('plotly')(config.plotly.account_name, config.plotly.api_key)

debug("config is")
debug(config)
// bitcoin
const BitcoindClient = require("bitcoin-core");
const bitcoindclient = new BitcoindClient(config.bitcoin);

// functions

function getallUsersDepossitedAmounts(){
  return new Promise((resolve, reject) => {
    User.find({} , ["id"], (err, ids) => {
      if (err) reject(err);
      console.log("ids are "+ ids)
      let ps = [];
      for (let i = 0, size = ids.length; i<size; ++i) {
        console.log("id is " + ids[i])
        ps.push(PromisegetUserBalance(ids[i].id))
      }

      Promise.all(ps).then((result) => resolve(result))
    })
  })
}

function getallUsersOkimochiAmounts(length){
  return new Promise((resolve, reject) => {
    let result = [];
    for (i=0, size=length; i<size; ++i){
      result.push(Math.random())
    }
    resolve(result)
  })
}


async function PromisegetRankingChart(){
  const x = await getallUsersDepossitedAmounts()
  const y = await getallUsersOkimochiAmounts(x.length)
  debug("x is ", x)
  debug("y is ", y)

  var data = [
  {
    x: x,
    y: y,
    name: 'ranking',
    mode: "markers",
    marker: {
      color: "rgb(164, 194, 244)",
      size: 12,
      line: {
        color: "white",
        width: 0.5
      }
    },
    type: 'scatter'
  }
  ];
var layout = {
  title: 'okimochi-ranking',
  xaxis: {
    title: "the amount depositted",
    showgrid: false,
    zeroline: false
  },
  yaxis: {
    title: "the amount of OKIMOCHI",
    showline: false
  },
  autosize: false,
  width: 960,
  height: 540
};

var opts = {
  layout: layout,
  filename: 'okimochi-ranking',
  fileopt: 'new'
};

return new Promise((resolve, reject) => {
    plotly.plot(data, opts, (err, msg) => {
      if (err) reject(err);
      else resolve(msg);
    })
  })

}

function PromiseSetAddressToUser(userId, address){
  debug(userId);
  debug(address)
  return new Promise((resolve, reject) => {
  bitcoindclient.validateAddress(address, (err, result) => {
    debug(err);
    debug(result);
    if (err){
      reject(err)
    }
      if (result && result.isvalid){
        User.update( {id: userId},
        {$push: {paybackAddresses: {address: address, used: false}}},
        {upsert: true, 'new': true}, (res) => {resolve(res)})
        resolve()
      } else {
        reject(new Error('please enter valid address !'))
      }
    })
  })
}

/**
 * from users information. choose unused paybackAddress Preferentially.
 * And mark that Address as "used". and returns updated info and address to use.
 * @param {Object} userContent
 * @return {Array} first address for using as paying back. Second updated user info
 *  and third is String for bot to speak
 */
function extractUnusedAddress(userContent){
  let paybackAddresses = userContent.paybackAddresses
  let address;
  let replyMessage = "";
  let addressIndex;
  if (!paybackAddresses || paybackAddresses.length === 0){
    address = null
  } else if (paybackAddresses.every((a) => a.used)){
    replyMessage += "warning: all addresses has been used.\n" +
      "So using the one we used before!\n" +
      "Please register the new address for the sake of fungibility! \n"
    address = paybackAddresses.pop().address
  } else {
    addressIndex = paybackAddresses.findIndex((e) => !e.used)
    debug(addressIndex)
    address = paybackAddresses[addressIndex].address
    debug(userContent)
    console.log("\n\n\n\n")
    debug(addressIndex)
    userContent.paybackAddresses[addressIndex].used = true;
  }
  replyMessage += "Sending Tx to " + address + "\n"
  return [address, userContent, replyMessage];
}


function PromiseFindUser(userid){
  return new Promise((resolve, reject) => {
    User.findOne({id: userid}, (err, content) => {
      if (err) {
        reject(err)
    // if user has not registered yet.
      } else if (content === null || content  === undefined ){
        const replyMessage = formatUser(userid) +
          " is not in db. \nplease register or deposit first!";
        reject( new Error(replyMessage))
      } else {
        resolve(content)
      }
    })
  });
}


/*
 * @param {string} userid to retreive the balance
 * @return {Promise} Which will resolves to Integer amount of BTC that the user has depositted.
 */
function PromisegetUserBalance(userid){
  return PromiseFindUser(userid)
    .then((content) => {
      debug("content is " + content)

      content = content.toObject()
      return content.depositAddresses
        .map((a) => bitcoindclient.validateAddress(a))
    })
    .then((ps) => {
      return Promise.all(ps)
        .then((results) => {
          debug("results were " + results)
          return results.filter((r) => r.isvalid)
        })
        .then((validAddresses) => {
          debug("validAddresses were " + validAddresses);
          return Promise.all(
            validAddresses.map((a) => {
              debug("address validation result is " + a);
              return bitcoindclient.getReceivedByAddress(a.address)
            })
          )
        })

        .then((amounts) => {
          debug("amounts are" + amounts);
          debug(Object.prototype.toString.call(amounts))
          return amounts.reduce((a, b) => a + b, 0)
        })
    })
}



function getRateJPY() {
  const rate_api_url = 'https://coincheck.com/api/exchange/orders/rate?order_type=buy&pair=btc_jpy&amount=1';
  let response = sync_request('GET', rate_api_url);
  let rate;
  if (response.statusCode == 200) {
    rate = Math.round(JSON.parse(response.body).rate);
    return rate;
  }
}


function jpy2btc(jpyAmount) {
  let rate = getRateJPY();
  return jpyAmount * 1.0 / rate;
}

function inBTC(satoshi) {
  return (satoshi / 100000000.0).toFixed(4);
}

function inSatoshi(BTC) {
  return parseFloat((btc * 100000000).toFixed(0));
}

const message_to_BTC_map = {
  ":bitcoin:": 0.0001,
  "感謝": 0.0001,
  "ありがと": 0.0001,
  "thanks": 0.0001,
  "どうも": 0.0001,
  ":pray:": 0.0001,
  ":okimochi:": 0.001,
  "気持ち": 0.0001,
  "きもち": 0.0001
}

const thxMessages = Object.keys(message_to_BTC_map);
const userIdPattern = /<@([A-Z\d]+)>/ig;
const formatUser = (user) => `<@${user}>`
const amountPattern = /([\d\.]*)/ig;

// slackbot settings.

let controller = Botkit.slackbot({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scopes: ['bot'],
  logger: new winston.Logger({
    levels: winston.config.syslog.levels,
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: './okimochi.log'})
    ]
  })
}).configureSlackApp(
  config.botconfig
);


let bot = controller.spawn({
  token: config.TOKEN,
  debug: config.SLACK_DEBUG
}).startRTM((err) => {
  if (err) {
    throw new Error(err);
  }
});

bot.configureIncomingWebhook({
  url: "https://hooks.slack.com/services/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"
});

if (process.env.NODE_ENV === "production"){
  bot.sendWebhook({
    text: "OKIMOCHI has been updated !",
    channel: config.default_channel,
    icon_emoji: config.icon_emoji
  }, (err, res) => {
    if (err) throw err;
  })
}

// database initialization
const mongoose = require("mongoose");
mongoose.Promise = global.Promise
mongoose.connect(config.mongoUri, {
  useMongoClient: true,
  autoReconnect: true
})
  .then((db) => {return db.once('open', () => {
    console.log("db is open!")
  })})
  .catch((err) => {throw err})



const Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

let UserSchema = new Schema({
  _id: ObjectId,
  id: String,
  depositAddresses: [String],
  paybackAddresses: [
    {
      address: String,
      used: {type: Boolean, default: false}
    }
  ],
})

const User = mongoose.model('User', UserSchema);
const testuser = new User({
  id: "exampleUsername",
  depositAddresses: ["mg73QvN2KmVzJ9wW56uU7ViFwzrfeqchmw"],
  paybackAddresses: [{
    address: "miS3tb8CZ2CXWwRsGNK2EqXCfmzP6bcjv",
    used: false
  }]
});

mongoose.connection.on( 'connected', function(){
    console.log('connected.');
});

mongoose.connection.on( 'error', function(err){
    console.log( 'failed to connect a mongo db : ' + err );
});

// mongoose.disconnect() を実行すると、disconnected => close の順番でコールされる
mongoose.connection.on( 'disconnected', function(){
    console.log( 'disconnected.' );
});

mongoose.connection.on( 'close', function(){
    console.log( 'connection closed.' );
});

User.update({id: "exampleUsername"}, testuser, {upsert: true})
  .then((res) => {
    console.log(res);
    User.find({id: "exampleUsername"})
      .then(res => {
        debug("found user is " + JSON.stringify(res))
      })
    })
  .catch(err => {throw new Error(err)})

// deposit
controller.hears(`deposit`, ["direct_mention", "direct_message", "mention"], (bot, message) => {
  controller.logger.debug("heard deposit")
  bitcoindclient.getNewAddress()
    .then((address) => {
      bot.reply(message, "Please deposit to this address")
      bot.reply(message, address)
      return address
    })
    .then((address) => User.update({ id: message.user },
        {$push: {depositAddresses: address}},
        {upsert: true}, () => debug("registered " + address + " as " + 
          formatUser(message.user) + "'s")))
    .catch((err) => {bot.reply(err)})


})

// register
controller.hears('register', ["direct_mention", "direct_message"], (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    if (err) {
      throw err
    }
    convo.ask("please paste your bitcoin address (separated by \\n) of " + config.bitcoin.network, (response, convo) => {
      let ps1 = [];
      let ps2 = [];
      let ps3 = [];
      addresses = response.text.split("\n")
      for (i=0, size=addresses.length; i < size; ++i) {
        ps1.push(bitcoindclient.validateAddress(addresses[i]))
        isLast = i === size - 1
        if (!isLast){
          ps2.push(bitcoindclient.importAddress(addresses[i], "for user " + message.user, false))
        }
        ps3.push(PromiseSetAddressToUser(message.user, addresses[i]))
      }

      Promise.all(ps3)
        .then(() => convo.say("successfully registered address as " + formatUser(message.user) + "'s !"))
        .then(() => convo.next())
        .catch((err) => {convo.say(err.toString())}).then(() => {convo.next()})

      Promise.all(ps1)
        .then(() => Promise.all(ps2))
        .then((result) => {
            debug("result was ", result)
            return bitcoindclient.importAddress(addresses[addresses.length - 1], formatUser(message.user) + "'s' !", true)
          })
        .then(() => convo.say("import registered address and now rescanning"))
        .then(() => convo.next())
        .catch((err) => {convo.say(err.toString())}).then(() => {convo.next()})
    })
  })
})
/*
// pay by gratitude

const patternize = (msg) => String.raw`(.*)(${msg})(.*)`;
const paypattern = thxMessages.map(patternize);

controller.hears(paypattern, ["direct_mention", "direct_message", "ambient"], (bot, message) => {
  const before = message.match[1];
  const thxMessage = message.match[2]
  const after = message.match[3];

  if ((userIdPattern.test(before) === false) && (userIdPattern.test(after) === false)) {
    bot.reply(message, "not going to pay since there was no user in the message");
    return
  }
半分独り言です。
  let bfuser = before.match(userIdPattern)
  let afuser = after.match(userIdPattern)
  console.log("bfuser is " + bfuser + " and afuser is " + afuser);
  let usernames = [bfuser, afuser].filter((v) => v !== null)
  console.log("usernames be fore concat are " + usernames)
  usernames = Array.prototype.concat.apply([], usernames) // flatten
    .map((u) => u.replace(/@|<|>/g, ""))
  console.log("going to pay " + usernames);

  for(let u of usernames){
    controller.storage.users.get(u, (err, content) => {
      if (err) {
        throw new Error("no username in entry "+ err)
      }
      if (content === null || !content.address){
        controller.logger.info("content was " + JSON.stringify(content));
        controller.storage.users.save({id: u}, (err) => {
          return bot.reply(message, u + "had no registered address, so not going to pay");
        })
      }else{
        controller.logger.info("content is " + content);
        const paybackAddress = content.address.pop();
        console.log("payback address is " + paybackAddress)
        bitcoindclient.sendToAddress(paybackAddress,
          message_to_BTC_map[thxMessage],
          "this is comment.",
          u)
        return bot.reply(message, "payed to " + formatUser(u) )
      }
    })
  }
});
*/

// tip by reaction
controller.on(['reaction_added'], (bot, message) => {
  debug("reaction added !")
  debug("and message object is " + JSON.stringify(message));
  const emoji = ":" + message.reaction + ":"
  if (thxMessages.some((p) => p === emoji)) {

    // 支払い
    const amount = message_to_BTC_map[emoji]
    smartPay(message.user, message.item_user, amount, emoji,
      (err, msg) => {
        if (err) {

          bot.sendWebhook({
            text: "had following error when sending to " + formatUser(message.item_user) +
              " from " + formatUser(message.user) + " by " + emoji  + " \n\n" + err.toString(),
            channel: config.default_channel,
            icon_emoji: config.icon_emoji
          }, (err, res) => {
            if (err) throw err;
          })

        } else {
          debug("msg was " + msg)
          bot.sendWebhook({
            text: msg,
            channel: config.default_channel,
            icon_emoji: config.icon_emoji
          }, (err, res) => {
            if (err) throw err;
          })
        }
    })
  }
})


function smartPay(fromUserID, toUserID, amount, Txmessage, cb) {
  debug("paying from " + fromUserID);
  debug("paying to " + toUserID);
  let returnMessage = "";
  User.findOne({ id: fromUserID }, (err, fromUserContent) => {
    if (fromUserContent === null || fromUserContent === undefined){
      console.log("fromUserContent was " + JSON.stringify(fromUserContent));
      returnMessage = formatUser(fromUserID) +
        " had no registered address, so not going to pay.\nPlease register first!";
      cb(null, returnMessage);
      return;
    }

    User.findOne({id: toUserID}, (err, toUserContent) => {
      if (toUserContent === null || toUserContent === undefined ) {
        console.log("to UserContent was " + JSON.stringify(toUserContent));
        returnMessage = formatUser(toUserID) +
          " had no registered address, so not going to pay.\nPlease register first!";
        cb(null, returnMessage)

      } else {

        // check if all paybackAddresses has been used.
        let [address, updatedContent, replyMessage] =
          extractUnusedAddress(toUserContent);
        debug("going to pay to " + address);
        debug("of user " + updatedContent);
        if (!address){
          cb(new Error(formatUser(toUserID) + " had no registered address! so not going to pay"), null)
        } else {

          returnMessage = replyMessage +
            " payed to " + formatUser(toUserID)
          bitcoindclient.sendToAddress(address,
            amount,
            Txmessage,
            "this is comment."
          )
            .then(() => updatedContent.save())
            .then(() => cb(null, returnMessage))
            .catch((err) => cb(err, null))
        }
      }
    })
  })
}

// tip intentionally
controller.hears(`tip ${userIdPattern.source} ${amountPattern.source}(.*)`, ["direct_mention", "direct_message"], (bot, message) => {
  controller.logger.debug("whole match pattern was " + message.match[0]);
  const toPayUser = message.match[1];
  const amount = Number(message.match[2]);
  const Txmessage = message.match[3] || "no message";
  if (isNaN(amount)){
    return bot.reply(message, "please give amount of BTC in number !");
  }
  if (message.user === toPayUser){
    return bot.reply(message, "can not pay to your self !!")
  }
  smartPay(message.user, toPayUser, amount, Txmessage,
    (err, msg) => {
      if (err) {bot.reply(message, err.toString())} else {bot.reply(message, msg)}
    });
})

// ranking
controller.hears(`ranking`, ['mention', 'direct_mention', 'direct_message'], (bot, message) => {
  PromisegetRankingChart()
    .then((msg) => {
      console.log("msg was \n")
      bot.reply(message, msg.url)
      console.log("finished plotting!")
    })
    .catch(err => bot.reply(message, err.toString()))
})
// balance
controller.hears(`balance`, ['mention', 'direct_mention', 'direct_message'], (bot, message) => {
  bot.startConversation(message, (err, convo) => {


    const firstQuestion = "who's balance is the one you want to know? (me|total|@userid)"

    const callbacks = [
      {
        pattern: "me",
        callback: (reply, convo) => {
          PromisegetUserBalance(message.user)
            .then((deposittedBalance) => {
              convo.say(formatUser(userid) + " depositted " + deposittedBalance + " BTC");
            })
            .catch(err => convo.say(err.toString()))
            .then(() => convo.next());
        }
      },

      {
        pattern: "total",
        callback: (reply, convo) => {
          bitcoindclient.getBalance()
            .then((balance) => {
              convo.say('the total deposited balance is ' + balance);
            })
            .catch((err) => {convo.say(err.toString())})
            .then(() => convo.next())
        }
      },

      {
        pattern: userIdPattern,
        callback: (reply, convo) => {
          userId = reply.text.match(userIdPattern)[0].slice(2, -1);
          debug("uesrId is\n" + userId);
          PromisegetUserBalance(message.user)
            .then((deposittedBalance) => {
              convo.say(formatUser(userid) + " depositted " + deposittedBalance + " BTC");
          })
            .catch(err => convo.say(err.toString()))
            .then( () => convo.next())
        }
      },

      {
        default: true,
        callback: (response, convo) => {
          convo.say("Please specify either me|total|@<username>");
          convo.repeat();
          convo.next();
        }
      }
    ]


    convo.ask(firstQuestion, callbacks)
  })
})

// rate
controller.hears('^rate$', ['direct_mention', 'direct_message'], (bot, message) => {
  let rate = getRateJPY();
  if (rate) {
    bot.reply(message, `1BTC is now worth ${rate}JPY!`);
  } else {
    bot.reply(message, 'cannot get the rate somehow :pensive:');
  }
});

// help
controller.hears("help", ["direct_mention", "direct_message"], (bot, message) => {
  let usage = `
  \`\`\`
  # show @users bitcoin deposit address
  - @okimochi-bitcoin deposit

  # register the address for getting paied
  - @okimochi-bitcoin register

  # show this help
  - @okimochi-bitcoin help

  # show balance of someone
  - @okimochi-bitcoin balance

  # show BTC-JPY rate
  - @okimochi-bitcoin rate

  # tip intentionally ... message will be included as Tx message for bitcoin
  - @okimochi-bitcoin tip @user <BTC amount> <message>

  # show ranking for depositted amount and the amount payed to registered Address
  - @okimochi-bitcoin ranking

  # :bitcoin: や :okimochi: などのリアクションを押すと自動的に支払われるよ！
  # 将来的には誰かが「ありがとう」などの言葉を発した時にも自動でtipする予定！
  #
  \`\`\`
  `;
  bot.reply(message, usage);
});

