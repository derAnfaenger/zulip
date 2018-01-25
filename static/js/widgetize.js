var widgetize = (function () {

var exports = {};

var widgets = {};

function get_widget_type(message) {
    // HACK - we will have the server pass us down info
    if (message.content === '<p>poll</p>') {
        return 'poll';
    }
}

var poll_data_holder = function () {
    // This object just holds data for a poll, although it
    // works closely with the widget's concept of how data
    // should be represented for rendering, plus how the
    // server sends us data.
    var self = {};

    var me = people.my_current_user_id();
    var key_to_comment = {};
    var my_idx = 1;

    self.get_widget_data = function () {
        var comments = [];

        _.each(key_to_comment, function (obj, key) {
            var voters = _.keys(obj.votes);

            comments.push({
                comment: obj.comment,
                names: people.safe_full_names(voters),
                count: voters.length,
                key: key,
            });
        });


        var widget_data = {
            comments: comments,
        };

        return widget_data;
    };

    self.handle = {
        new_comment: {
            outbound: function (comment) {
                var event = {
                    type: 'new_comment',
                    idx: my_idx,
                    comment: comment,
                };

                my_idx += 1;

                return event;
            },

            inbound: function (sender_id, data) {
                var idx = data.idx;
                var key = sender_id + ',' + idx;
                var comment = data.comment;
                var votes = {};

                votes[sender_id] = 1;

                key_to_comment[key] = {
                    comment: comment,
                    user_id: sender_id,
                    votes: votes,
                };
            },
        },

        vote: {
            outbound: function (key) {
                var vote = 1;

                // toggle
                if (key_to_comment[key].votes[me]) {
                    vote = -1;
                }

                var event = {
                    type: 'vote',
                    key: key,
                    vote: vote,
                }

                return event;
            },

            inbound: function (sender_id, data) {
                var key = data.key;
                var vote = data.vote;

                var votes = key_to_comment[key].votes;

                if (vote === 1) {
                    votes[sender_id] = 1;
                } else {
                    delete votes[sender_id];
                }
            },
        }
    };

    self.handle_event = function (sender_id, data) {
        var type = data.type;
        if (self.handle[type]) {
            self.handle[type].inbound(sender_id, data);
        }
    };

    return self;
};

widgets.poll = (function () {
    var cls = {};

    cls.activate = function (opts) {
        var elem = opts.content_holder;
        var callback = opts.callback;

        var self = {};

        var poll_data = poll_data_holder();

        function render() {
            var widget_data = poll_data.get_widget_data();

            var html = templates.render('poll-widget', widget_data);
            elem.html(html);

            elem.find("button.poll-comment").on('click', function (e) {
                e.stopPropagation();
                var comment = elem.find("input.poll-comment").val();

                var data = poll_data.handle.new_comment.outbound(comment);
                callback(data);
            });
            elem.find("button.poll-vote").on('click', function (e) {
                e.stopPropagation();
                var key = $(e.target).attr('data-key');

                var data = poll_data.handle.vote.outbound(key);
                callback(data);
            });
        }

        self.handle_event = function (sender_id, data) {
            poll_data.handle_event(sender_id, data);
            render();
        };

        render();

        return self;
    };

    return cls;
}());

exports.activate = function (in_opts) {
    var content_holder = in_opts.row.find('.message_content');
    var message_id = in_opts.message_id;
    var message = message_store.get(in_opts.message_id);

    var widget_type = get_widget_type(message);

    if (widget_type === undefined) {
        return;
    }

    var callback = function (data) {
        var url = '/json/widgets/event';

        channel.post({
            url: url,
            data: {
                message_id: message_id,
                data: JSON.stringify(data),
            },
        });
    };

    var widget = widgets[widget_type].activate({
        content_holder: content_holder,
        callback: callback,
        message: message,
    });

    message.widget = widget;
};

exports.handle_event = function (widget_event) {
    var message = message_store.get(widget_event.message_id);

    message.widget.handle_event(widget_event.sender_id, widget_event.data);
};

return exports;

}());
if (typeof module !== 'undefined') {
    module.exports = widgetize;
}
