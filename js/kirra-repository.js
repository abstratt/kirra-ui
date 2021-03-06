var kirra = {};

kirra.newRepository = function(applicationUri) {
    var newRepo = Object.create(this.template);
    newRepo._applicationUri = applicationUri;
    return newRepo;
};

kirra.template = {
    _application: {},
    _entityList: [],
    _entityCapabilityList: [],
    _applicationUri: null,

    loadApplication: function (callback)	 {
        this.load(this._applicationUri, callback, "_application");
    },
    
    loadEntityCapabilities: function (callback, retry) {
        var me = this;
        if (!me._application.entityCapabilities) {
            if (retry === false)
                return;
            this.loadApplication(function () {
                me.loadEntityCapabilities(callback, false);
            });
            return;
        }
        this.load(me._application.entityCapabilities, callback, "_entityCapabilityList");
    },
    
    loadEntities: function (callback, retry) {
        var me = this;
        if (!me._application.entities) {
            if (retry === false)
                return;
            this.loadApplication(function () {
                me.loadEntities(callback, false);
            });
            return;
        }
        this.load(me._application.entities, callback, "_entityList");
    },
    

    loadEntity: function (entityFullName, callback, retry) {
        if (!entityFullName)
            throw Error("Missing entityFullName: " + entityFullName);
        for (var i in this._entityList) {
            if (this._entityList[i].fullName == entityFullName) {
                var entityUri = this._entityList[i].uri;
                this.load(entityUri, callback, "entity." + entityFullName);
                return;
            }
        }
        if (retry === false)
            throw Error("Entity not found: " + entityFullName);
        // entity not found - reload entities before giving up
        var me = this;
        this.loadEntities(function () {
            // turn retry off
            me.loadEntity(entityFullName, callback, false);
        });
    },
    
    /* Generic helper for performing Ajax invocations. */
    load: function (uri, callback, slotName, errorCalback) {
        var me = this;
        var request = new XMLHttpRequest();
        
        request.open("GET", uri, true);
        request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        request.withCredentials = true;
        request.onreadystatechange = function() {
            if (request.readyState !== 4) {
                return;
            }
            var parsedResponse = request.responseText && JSON.parse(request.responseText);
	        if (slotName && request.status == 200) {
	            me[slotName] = parsedResponse;
            }
        	callback(parsedResponse, request.status);
        };
        request.send();
    }
};
