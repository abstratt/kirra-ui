var uriMatches = window.location.search.match("[?&]?app-uri\=([^&]+)");
var pathMatches = window.location.search.match("[?&]?app-path\=([^&]+)");
var themeMatches = window.location.search.match("[?&]?theme\=([^&]*)")


if (!uriMatches && !pathMatches) {
     throw Error("You must specify an application URI or path (same server) using the app-uri or app-path query parameters, like '...?app-uri=http://myserver.com/myapp/rest/' or '...?app-path=/myapp/rest/'.");
}
var applicationUrl = uriMatches ? uriMatches[1] : (window.location.origin + pathMatches[1]);
if (!applicationUrl.endsWith('/')) applicationUrl = applicationUrl + '/';

var changeTheme = function(theme) {
    var themeElement = document.getElementById('bootstrap_theme');
    var newThemeURI = 'https://maxcdn.bootstrapcdn.com/bootswatch/3.3.6/' + theme + '/bootstrap.min.css';
    document.getElementById('bootstrap_theme').href = newThemeURI;
};

var canChangeTheme = themeMatches;

if (canChangeTheme && themeMatches[1]) {
    var theme = themeMatches[1];
    changeTheme(theme); 
}

var repository = kirra.newRepository(applicationUrl);

var kirraNG = {};

var application;
var entities;
var entitiesByName;
var entityCapabilitiesByName;
var entityNames;
var kirraModule;
var encodedCredentials = undefined;

kirraNG.capitalize = function(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

kirraNG.filter = function(arrayOrMap, filter, mapping) {
    var result = [];
    mapping = mapping || function(it) { return it; };
    angular.forEach(arrayOrMap, function(it) {
        if (filter(it)) {
            result.push(mapping(it));
        }
    });
    return result;
};

kirraNG.find = function(arrayOrMap, filter) {
    var found = undefined;
    angular.forEach(arrayOrMap, function(it, it2) {
        if (!found && filter(it, it2)) {
            found = it;
        }
    });
    return found;
};

kirraNG.map = function(arrayOrMap, mapping) {
    return kirraNG.filter(arrayOrMap, function() { return true; }, mapping);
};

kirraNG.generateHtmlName = function(camelCase) {
    return camelCase.replace(/([a-z])([A-Z])/g, '$1-$2').replace('.', '-').toLowerCase();
}

kirraNG.generateInstanceListControllerName = function(entity) {
    return entity.fullName + 'InstanceListCtrl';
};

kirraNG.generateEntityServiceName = function(entity) {
    return entity.fullName + 'Service';
};

kirraNG.toState = function(entityFullName, kind) {
    return entityFullName.replace('.', ':') + ":" + kind;
};

kirraNG.generateEntitySingleStateName = function(entity) {
    return entity.fullName.replace('.', ':') + ".single";
};

kirraNG.filterCandidates = function(instances, value) {
    value = value && value.toUpperCase();
    var filtered = kirraNG.filter(instances, 
        function(it) { return (it.shorthand.toUpperCase().indexOf(value) == 0); },
        function(it) { return it; }
    );
    return (filtered && filtered.length > 0) ? filtered : instances;
}; 

kirraNG.buildTableColumns = function(entity) {
    var tableColumns = [];
    angular.forEach(entity.properties, function(property) {
        if (property.userVisible && property.typeRef.typeName != 'Memo') {
            tableColumns.push(property);
        }
    });
    angular.forEach(entity.relationships, function(relationship) {
        if (relationship.userVisible && !relationship.multiple) {
            tableColumns.push(relationship);
        }
    });
    kirraNG.sortFields(entity, tableColumns);
    return tableColumns;
};

kirraNG.toggleDatePicker = function ($event, $scope, propertyName) { 
    $event.stopPropagation();
    if (!$scope.datePickerStatus) {
        $scope.datePickerStatus = {};
    }
    $scope.datePickerStatus[propertyName] = !$scope.datePickerStatus[propertyName];
};

kirraNG.buildInputFields = function(entity, createMode) {
    var inputFields = [];
    angular.forEach(entity.properties, function(property) {
        if (property.userVisible && ((createMode && property.initializable) || (!createMode && property.editable))) {
            inputFields.push(property);
        }
    });
    angular.forEach(entity.relationships, function(relationship) {
        if (relationship.userVisible && !relationship.multiple && ((createMode && relationship.initializable) || (!createMode && relationship.editable))) {
            inputFields.push(relationship);
        }
    });
    kirraNG.sortFields(entity, inputFields);
    return inputFields;
};

kirraNG.sortFields = function(entity, fields) {
    var orderedDataElements = kirraNG.getOrderedDataElements(entity);
    fields.sort(function(a, b) { 
        return orderedDataElements.indexOf(a.name) - orderedDataElements.indexOf(b.name); }
    );
};

kirraNG.buildViewFields = function(entity) {
    var viewFields = [];
    angular.forEach(entity.properties, function(property) {
        if (property.userVisible) {
            viewFields.push(property);
        }
    });
    angular.forEach(entity.relationships, function(relationship) {
        if (relationship.userVisible && !relationship.multiple) {
            viewFields.push(relationship);
        }
    });
    kirraNG.sortFields(entity, viewFields);
    return viewFields;
};

kirraNG.getEnabledActions = function(instance, instanceActions) {
    return kirraNG.filter(instanceActions, function(action) { 
        return instance.disabledActions && instance.disabledActions[action.name] == undefined;
    });
};

// this version is required to workaround a weird issue were using an object (as the basic buildViewData does) would cause all sorts of problems
kirraNG.buildViewDataAsArray = function(entity, instance) {
    // need to preserve order to allow retrieval by index
    var fieldValuesByName = {};
    angular.forEach(entity.properties, function(property) {
        if (property.userVisible) {
            fieldValuesByName[property.name] = instance.values[property.name];
        }
    });
    angular.forEach(entity.relationships, function(relationship) {
        if (relationship.userVisible && !relationship.multiple) {
            if (instance.links[relationship.name]) { 
                fieldValuesByName[relationship.name] = {
                    shorthand: instance.links[relationship.name].shorthand,
                    objectId: instance.links[relationship.name].objectId
                };
            } else {
                fieldValuesByName[relationship.name] = {};    
            }
        }
    });
    var orderedDataElements = kirraNG.getOrderedDataElements(entity); 
    var fieldValues = [];
    angular.forEach(orderedDataElements, function(name) {
        if (fieldValuesByName.hasOwnProperty(name)) {
            fieldValues.push(fieldValuesByName[name]);
        }
    });
    return fieldValues;
};

kirraNG.getOrderedDataElements = function(entity) {
    if (entity.orderedDataElements) {
        return entity.orderedDataElements;
    }
    var orderedDataElements = [];
    angular.forEach(entity.properties, function(property, name) {
        if (property.userVisible) {
            orderedDataElements.push(name);
        }
    });
    angular.forEach(entity.relationships, function(relationship, name) {
        if (relationship.userVisible && !relationship.multiple) {
            orderedDataElements.push(name);
        }
    });
    return orderedDataElements;
};

kirraNG.buildViewData = function(entity, instance) {
    var data = {};
    angular.forEach(entity.properties, function(property, name) {
        if (property.userVisible && instance.values[name] != undefined) {
            data[name] = instance.values[name];
        }
    });
    angular.forEach(entity.relationships, function(relationship, name) {
        if (relationship.userVisible && !relationship.multiple) {
            var link = instance.links[name];
            data[name] = link ? {
                shorthand: link.shorthand,
                objectId: link.objectId
            } : {}
        }
    });
    return data;
};

kirraNG.loadEntityCapabilities = function(loadedCallback) {
    repository.loadEntityCapabilities(function(loadedEntityCapabilities) {
        entityCapabilitiesByName = loadedEntityCapabilities;
        loadedCallback();
    });
};


kirraNG.buildRowData = function(entity, instance, instanceActions) {
    var data = kirraNG.buildViewData(entity, instance);
    var row = { 
        data: data, 
        raw: instance,
        actionEnablement: kirraNG.buildActionEnablement(instanceActions)
    };
    return row;
};

kirraNG.buildActionEnablement = function(instanceActions) {
    return {
        enabledActions: [],
        useDropdown: true,
        loaded: false,
        load: function(instance) {
            this.enabledActions = kirraNG.getEnabledActions(instance, instanceActions);
            this.useDropdown = this.enabledActions.length > 0;
            this.loaded = true;
            return this; 
        },
        reset: function() {
            this.loaded = false;
            enabledActions = [];
            useDropdown = true;
            return this;
        }
    };
};

kirraNG.buildTableData = function(instances, fixedEntity) {
    var rows = [];
    var fixedInstanceActions = fixedEntity && kirraNG.getInstanceActions(fixedEntity);
    angular.forEach(instances, function(instance){
        // we compute the entity every time to allow for heterogeneous collections
        var entity = fixedEntity || entitiesByName[instance.typeRef.fullName];
        var instanceActions = fixedInstanceActions || kirraNG.getInstanceActions(entity);
        rows.push(kirraNG.buildRowData(entity, instance, instanceActions));
    });
    return rows;
};

kirraNG.getInstanceActions = function(entity) {
    return kirraNG.filter(entity.operations, function(op) { return op.instanceOperation && op.kind == 'Action'; });
};

kirraNG.getEntityActions = function(entity) {
    return kirraNG.filter(entity.operations, function(op) { return !op.instanceOperation && op.kind == 'Action'; });
};

kirraNG.getMultiChildRelationships = function(entity) {
    return kirraNG.filter(entity.relationships, function(rel) { 
    	return rel.style == 'CHILD' && rel.multiple && rel.userVisible; 
	});
};

kirraNG.getMultiRegularRelationships = function(entity) {
    return kirraNG.filter(entity.relationships, function(rel) { 
    	return rel.style != 'CHILD' && rel.multiple && rel.userVisible; 
	});
};

kirraNG.getQueries = function(entity) {
    return kirraNG.filter(entity.operations, function(op) { 
        var isMatch = !op.instanceOperation && op.kind == 'Finder' && op.typeRef.fullName == entity.fullName && op.multiple;
        return isMatch; 
    });
};

kirraNG.isEditable = function(entity) {
    var check = function (it) { return it.editable; };
    return kirraNG.find(entity.properties, check) || kirraNG.find(entity.relationships, check);
};

kirraNG.buildInstanceListController = function(entity) {
    var controller = function($scope, $state, instanceService) {
        
        var finderName = $state.params && $state.params.finderName;
        var finderArguments = $state.params && $state.params.arguments;
        var finder = finderName && entity.operations[finderName];
        var forceFetch = $state.params && $state.params.forceFetch;
        var reloadFunction = function() { $state.go($state.current.name, $state.params, { reload: true }); };
    
        $scope.$state = $state;
        $scope.table = true;
        $scope.entity = entity;
        $scope.filtered = finderName != undefined;
        $scope.finder = finder;
        $scope.inputFields = finder && finder.parameters;
        $scope.parameterValues = finderArguments || {};
        $scope.entityName = entity.fullName;
        $scope.tableProperties = kirraNG.buildTableColumns(entity);
        $scope.actions = kirraNG.getInstanceActions(entity);
        $scope.anyListCapability = true;
        $scope.instances = undefined;
        $scope.queries = kirraNG.getQueries(entity);
        $scope.entityActions = kirraNG.getEntityActions(entity);
        $scope.toggleDatePicker = function($event, propertyName) { kirraNG.toggleDatePicker($event, $scope, propertyName); };
        $scope.applyFilter = function() {
            var newStateParams = angular.merge({}, $state.params, { arguments: $scope.parameterValues, forceFetch: true });
            $state.go($state.current.name, newStateParams, { reload: true });
        };
        $scope.updateActionEnablement = function(row) {
            instanceService.get(entity, row.raw.objectId)
                .then(function(loaded) {
                    row.actionEnablement.load(loaded);
                }).catch(function(error) {
                    $scope.resultMessage = error.data.message;
                    $scope.clearAlerts();
                });
        };
        $scope.maxSize = 5;
        $scope.totalItems = 34;
        angular.forEach(finderArguments, function (arg, name) {
            if (typeof(arg) == 'object' && arg instanceof Date) {
                finderArguments[name] = moment(arg).format("YYYY/MM/DD");
            }
        });
        
        var performQuery = function(arguments, forceFetch) {
            $scope.instances = undefined;
            $scope.rows = undefined;
            var missingArguments = kirraNG.filter(finder.parameters, function(p) { return p.required; }, function (p) { return p.name; } );
            angular.forEach(arguments, function(value, name) {
                var index = missingArguments.indexOf(name);
                if (index >= 0) {
                    missingArguments.splice(index, 1);
                }
            });
            if (missingArguments.length == 0) {
                instanceService.performQuery(entity, finderName, arguments)
                    .then(function(instances) {
                        $scope.instances = instances;
                        $scope.rows = kirraNG.buildTableData(instances, entity);
                        $scope.resultMessage = instances.length > 0 ? "" : "No data found";
                    }).catch(function(error) {
                        $scope.resultMessage = error.data.message;
                        $scope.clearAlerts();
                    });
            } else {
                var parameterLabels = kirraNG.map(missingArguments, function (parameterName) {
                    var parameter = kirraNG.find(finder.parameters, function (p) { return p.name == parameterName; });
                    return parameter.label; 
                });
                $scope.instances = [];
                $scope.resultMessage = "Before you can apply this filter, you must fill in: " + parameterLabels;
            }
        };
        
        var populate = function() {
            if (finder) {
                performQuery(finderArguments, forceFetch);
            } else {
                instanceService.extent(entity).then(function(instances) { 
                    $scope.instances = instances;
                    $scope.rows = kirraNG.buildTableData(instances, entity);
                    $scope.resultMessage = instances.length > 0 ? "" : "No data found";
                });
            }
        };
        
        instanceService.getEntityCapabilities(entity).then(
            function(loaded) {
                var entityCapabilities = loaded.data;
                $scope.entityCapabilities = entityCapabilitiesByName[entity.fullName] = entityCapabilities;
                if (finderName) {
                    if (!entityCapabilities.queries[finderName] || entityCapabilities.queries[finderName].length == 0) {
                        // we don't actually have permission for the requested query 
                        $scope.finder = finder = undefined;
                    }
                    populate();
                } else {
                    if (entityCapabilities.entity.indexOf('List') == -1) {
                        // no permission to list all instances, fallback to first query that we can execute  
                        var firstQuery = kirraNG.find($scope.queries, function(q) { 
                            return entityCapabilities.queries[q.name] && entityCapabilities.queries[q.name].length > 0; 
                        });
                        if (firstQuery) {
                            $scope.performQuery(firstQuery);
                        } 
                    } else {
                        populate();
                    }
                }
            },
            function(error) {
                populate();
                $scope.entityCapabilities = undefined;
            }
        );
        
        $scope.findCandidatesFor = function(parameter, value) {
            return instanceService.extent(entitiesByName[parameter.typeRef.fullName]).then(function(instances) {
                return kirraNG.filterCandidates(instances, value);
            });
        };
        
        $scope.onCandidateSelected =  function(selectedCandidate, inputField, $label) {
            $scope.parameterValues[inputField.name] = selectedCandidate;
        };
        
        $scope.formatCandidate = function(inputField) {
            if (!$scope.parameterValues || !$scope.parameterValues[inputField.name]) {
                return '';
            }
            var value = $scope.parameterValues[inputField.name]; 
            return (value && value.shorthand) || value;
        };
        
        $scope.unfiltered = function() {
            $state.go(kirraNG.toState(entity.fullName, 'list'));
        };

        $scope.performInstanceActionOnRow = function(row, action) {
            var objectId = row.raw.objectId;
            var shorthand = row.raw.shorthand; 
            
            if (action.parameters.length > 0) {
                $state.go(kirraNG.toState(entity.fullName, 'performInstanceAction'), { objectId: objectId, shorthand: shorthand, actionName: action.name } );
                return;
            }
            
            var performResult = instanceService.performInstanceAction(entity, objectId, action.name);
            if (finder) {
                // better reload as the row may no longer satisfy the filter
                performResult.then(populate);
            } else {
                // when showing all, update only the row affected
                performResult.then(
                    populate
                );
            }
        };

        $scope.performEntityAction = function(action) {
            if (action.parameters.length > 0) {
                $state.go(kirraNG.toState(entity.fullName, 'performEntityAction'), { actionName: action.name } );
                return;
            }
            
            instanceService.performEntityAction(entity, action.name).then(
                function() {
                    $state.go($state.current.name, $state.params, { reload: true });
                }
            );
        };
        
        $scope.performQuery = function(finder) {
            $state.go(kirraNG.toState(entity.fullName, 'performQuery'), { 
                finderName: finder.name, 
                /* reset when switching*/ arguments: {} 
            });
        };
        
        $scope.create = function() {
            $state.go(kirraNG.toState(entity.fullName, 'create'));
        };
    };
    controller.$inject = ['$scope', '$state', 'instanceService'];
    return controller;
};

kirraNG.buildInstanceEditController = function(entity, mode) {
    var creation = mode == 'create';
    var editing = mode == 'edit';
    var childCreation = mode == 'createChild';
    var childEditing = mode == 'editChild';
    var controller = function($scope, $state, $stateParams, instanceService, $q) {
        var objectId = $stateParams.objectId;
     
        // in this controller, because it is used both for editing parents and children, the  actual entity will depend on the mode   
        var actualEntity;
        if (childCreation || childEditing) {
            var relationship = entity.relationships[$stateParams.relationshipName];
            $scope.parentEntity = entity;
            $scope.relationshipName = $stateParams.relationshipName;
            $scope.entity = actualEntity = entitiesByName[$stateParams.relatedEntity];
            $scope.childObjectId = $stateParams.childObjectId;
        } else {
            $scope.entity = actualEntity = entity;
        }

        $scope.mode = mode;
        $scope.$state = $state;
        $scope.objectId = objectId;
        $scope.actionEnablement = kirraNG.buildActionEnablement(kirraNG.getInstanceActions(actualEntity));
        $scope.entityName = actualEntity.fullName;
        $scope.toggleDatePicker = function($event, propertyName) { kirraNG.toggleDatePicker($event, $scope, propertyName); };

        $scope.loadInstanceCallback = function(instance) { 
            $scope.formLabel = creation ? ('Creating ' + actualEntity.label) : (childCreation ? ('Adding ' + actualEntity.label) : ('Editing ' + actualEntity.label + ': ' + instance.shorthand)); 
            $scope.raw = instance;
            $scope.actionEnablement.load(instance);
            $scope.propertyValues = angular.copy(instance.values);
            $scope.linkValues = angular.copy(instance.links);
            return instance;
        };
    
        $scope.inputFields = kirraNG.buildInputFields(actualEntity, creation);
        
        $scope.findCandidatesFor = function(relationship, value) {
            var domain;
            var objectId = creation ? '_template' : $scope.objectId;
            if (childCreation) {
                var relatedEntity = entitiesByName[relationship.typeRef.fullName];
                domain = instanceService.extent(relatedEntity);
            } else {
                domain = instanceService.getRelationshipDomain(actualEntity, objectId, relationship.name);
            }
            return domain.then(function(instances) {
                var candidates = kirraNG.filterCandidates(instances, value);
                if (!relationship.required) {
                    candidates.splice(0, 0, { shorthand: '- None -' });
                } 
                return candidates; 
            });
        };
        
        $scope.onCandidateSelected =  function(selectedCandidate, inputField, $label) {
            $scope.linkValues[inputField.name] = selectedCandidate.objectId ? selectedCandidate : null;
        };
        
        $scope.formatCandidate = function(inputField) {
            if (!$scope.linkValues || !$scope.linkValues[inputField.name]) {
                return '';
            }
            var value = $scope.linkValues[inputField.name];
            return (value && value.shorthand) || value;
        };
        
        $scope.cancel = function() {
            window.history.back();
        };
        
        $scope.save = function() {
            console.log("Save pressed");
            var newValues = angular.copy($scope.propertyValues);
            console.log(newValues);
            var newLinks = angular.copy($scope.linkValues);
            var newRepresentation = { values: newValues, links: newLinks };
            console.log("newRepresentation");
            console.log(newRepresentation);
            if (creation) {
                instanceService.post(actualEntity, newRepresentation).then(function(created) {
                    $state.go(kirraNG.toState(actualEntity.fullName, 'show'), { objectId: created.objectId } ); 
                });
            } else if (editing || childEditing) {
                newRepresentation.objectId = $scope.objectId;
                instanceService.put(actualEntity, newRepresentation).then(function() { window.history.back(); });
            } else if (childCreation) {
                var relationship = $scope.parentEntity.relationships[$scope.relationshipName];
                newRepresentation.links[relationship.opposite] = { objectId: $scope.objectId, scopeName: $scope.parentEntity.name, scopeNamespace: $scope.parentEntity.namespace };
                instanceService.post(actualEntity, newRepresentation).then(function(created) {
                    $state.go(kirraNG.toState($scope.parentEntity.fullName, 'show'), { objectId: $scope.objectId } ); 
                });
            }
        };
        instanceService.get(actualEntity, editing ? objectId : '_template').then($scope.loadInstanceCallback);
    };
    controller.$inject = ['$scope', '$state', '$stateParams', 'instanceService', '$q'];
    return controller;
};

kirraNG.buildActionController = function(entity) {
    var controller = function($scope, $state, $stateParams, instanceService, $q) {
        var objectId = $stateParams.objectId;
        var actionName = $stateParams.actionName;
        var action = entity.operations[actionName];

        $scope.$state = $state;
        $scope.objectId = objectId;
        $scope.entity = entity;
        $scope.entityName = entity.fullName;
        $scope.actionName = actionName;
        $scope.action = action;
        $scope.inputFields = action.parameters;
        $scope.parameterValues = {};
        $scope.toggleDatePicker = function($event, propertyName) { kirraNG.toggleDatePicker($event, $scope, propertyName); };
        
        if (objectId) {
            instanceService.get(entity, objectId).then(function(instance) { 
                $scope.shorthand = instance.shorthand; 
            });
        }
        
        $scope.findCandidatesFor = function(parameter, value) {
            var domain = instanceService.getParameterDomain(entity, $scope.objectId, actionName, parameter.name);
            return domain.then(function(instances) { return kirraNG.filterCandidates(instances, value); });
        };
        
        $scope.onCandidateSelected =  function(selectedCandidate, inputField, $label) {
            $scope.parameterValues[inputField.name] = selectedCandidate;
        };
        
        $scope.formatCandidate = function(inputField) {
            if (!$scope.parameterValues || !$scope.parameterValues[inputField.name]) {
                return '';
            }
            var value = $scope.parameterValues[inputField.name];
            return (value && value.shorthand) || value;
        };
        
        $scope.cancel = function() {
            window.history.back();
        };
        
        $scope.performAction = function() {
            var arguments = angular.copy($scope.parameterValues);
            var objectId = $scope.objectId;
            var actionName = $scope.actionName;
            if (objectId == undefined) {
                instanceService.performEntityAction(entity, actionName, arguments).then(kirraNG.handleActionResponse($state, entity, actionName));
            } else {
                instanceService.performInstanceAction(entity, objectId, actionName, arguments).then(kirraNG.handleActionResponse($state, entity, actionName));
            }
        };
    };
    controller.$inject = ['$scope', '$state', '$stateParams', 'instanceService', '$q'];
    return controller;
};

kirraNG.handleActionResponse = function ($state, entity, actionName) {
	return function(response) {
		var action = actionName && entity.operations[actionName];
		if (action.typeRef && action.typeRef.kind == 'Entity') {
			var resultInstance = response.data[0];
			var resultEntity = entitiesByName[action.typeRef.fullName];
			$state.go(kirraNG.toState(resultEntity.fullName, 'show'), { objectId: resultInstance.objectId } );
		} else {
			window.history.back();
		}
	};
};

kirraNG.buildInstanceLinkController = function(entity) {
    var controller = function($scope, $modalInstance, instanceService, objectId, relationship) {
        $scope.objectId = objectId;
        $scope.relationship = relationship;
        instanceService.getRelationshipDomain(entity, objectId, relationship.name).then(function(candidates) {
            $scope.candidates = candidates;
        });
        $scope.findCandidatesFor = function(value) {
            var domain = instanceService.getRelationshipDomain(entity, objectId, relationship.name);
            return domain.then(function(instances) { return kirraNG.filterCandidates(instances, value); });
        };
        $scope.onCandidateSelected =  function(selectedCandidate) {
            $scope.selected = selectedCandidate;
        };
        $scope.formatCandidate = function() {
            if (!$scope.selected) {
                return '';
            }
            var value = $scope.selected;
            return (value && value.shorthand) || value;
        };
        $scope.ok = function() {
            $modalInstance.close($scope);
        };
        $scope.cancel = function() {
            $modalInstance.dismiss();
        };
        
    };
    return controller;
};

kirraNG.buildDashboardController = function() {
    console.log("dashboard entities: ");
    console.log(entities);
    var controller = function($scope, $state, $stateParams, instanceService, $q, $http) {
        var metrics = [];
        angular.forEach(entities, function (entity) {
            var queries = kirraNG.filter(entity.operations, function(op) { 
                var isMatch = !op.instanceOperation && op.kind == 'Finder';
                return isMatch; 
            });
            angular.forEach(queries, function (query) {
                var entityCapabilities = entityCapabilitiesByName[entity.fullName];
                if (query.parameters && query.parameters.length > 0) {
                    return;
                }
                var queryCapabilities = entityCapabilities.queries && entityCapabilities.queries[query.name];
                if (!queryCapabilities || queryCapabilities.indexOf('StaticCall') < 0) {
                    return;
                }
                var finderUri = entity.finderUriTemplate.replace('(finderName)', query.name);
                var metric = {
                    query: query,
                    entity: entity,
                    result: "-",
                    finderUri: finderUri,
                    multiple: (query.typeRef.kind != 'Entity') && query.multiple
                };
                metrics.push(metric);
            });
        });
        $scope.metrics = metrics.slice();
        var loadMetrics;
        loadMetrics = function () {
            var next = metrics.shift();
            if (next) {
                $http.post(next.finderUri, {}).then(function(response) {
                    if (next.query.multiple) {
                        next.result = next.query.typeRef.kind == 'Entity' ? response.data.length : kirraNG.map(response.data.contents, function(row) {
                            var key;
                            for (key in row) {
                                if (Array.isArray(row[key])) {
                                    row[key] = row[key].length;
                                }
                            }
                            return row;
                        });
                    } else {
                        next.result = response.data.contents[0].shorthand || response.data.contents[0];  
                    }
                }).then(loadMetrics);
            }
        };
        loadMetrics();
    };
    controller.$inject = ['$scope', '$state', '$stateParams', 'instanceService', '$q', '$http'];
    return controller;
};

kirraNG.mergeEdgeRowDatas = function(rows, newRows) {
	rows.length = 0;
	newRows.forEach(function(value, index) {
	    rows.push(value);	
	});
};

kirraNG.buildInstanceShowController = function(entity) {
    var controller = function($scope, $state, $stateParams, instanceService, $q, $modal) {

        var objectId = $stateParams.objectId;

        $scope.$state = $state;
        $scope.objectId = objectId;

        $scope.entity = entity;

        $scope.entityName = entity.fullName;
        
        if (!entity.topLevel) {
            $scope.parentRelationship = kirraNG.find(entity.relationships, function(r) { return r.style = 'PARENT'; });
        }
        
        $scope.editable = kirraNG.isEditable(entity);

        $scope.loadInstanceCallback = function(instance) { 
            $scope.raw = instance;
            $scope.actionEnablement = kirraNG.buildActionEnablement(kirraNG.getInstanceActions(entity)).load(instance);
            $scope.fieldValues = kirraNG.buildViewDataAsArray(entity, instance);
            if (!$scope.relatedData)
            	$scope.relatedData = [];
            if (!$scope.childrenData)
            	$scope.childrenData = [];
            if (!entity.topLevel) {
                $scope.parentLink = instance.links[$scope.parentRelationship.name];
            }
            instanceService.getInstanceCapabilities(entity, objectId).then(function(loaded) {
                var capabilities = loaded.data;
                $scope.instanceCapabilities = capabilities;     
            });
            return instance;
        };
    
        $scope.viewFields = kirraNG.buildViewFields(entity);

        $scope.edit = function() {
            console.log(entity);
            $state.go(kirraNG.toState(entity.fullName, 'edit'), { objectId: objectId } );
        };
        
        $scope.delete = function() {
            instanceService.delete(entity, objectId).then(function() {
                window.history.back();
            });
        };
        
        $scope.unlink = function(relationship, relatedEntityName, otherId) {
            instanceService.unlink(entity, objectId, relationship.name, relatedEntityName + '@' + otherId).then(function() {
                return instanceService.get(entity, objectId).then($scope.loadInstanceCallback).then($scope.loadInstanceRelatedCallback);
            });
        };
        
        $scope.link = function(relationship, relatedEntity) {
            var objectId = this.objectId;
            var modal = $modal.open({
              animation: true,
              templateUrl: 'templates/link-instance.html',
              size: 'lg',
              controller: entity.fullName + 'InstanceLinkCtrl', 
              resolve: {
                objectId: function() { return objectId; },
                relationship: function() { return relationship; },
              }
            });
            modal.result.then(function(scope) {
                return instanceService.link(entity, objectId, relationship.name, relatedEntity.fullName + '@' + scope.selected.objectId);
            }).then(function() {
                return instanceService.get(entity, objectId);
            }).then($scope.loadInstanceCallback).then($scope.loadInstanceRelatedCallback); 
        };

        $scope.createChild = function(relationship, relatedEntity) {
            $state.go(kirraNG.toState(entity.fullName, 'createChild'), { objectId: this.objectId, relationshipName: relationship.name, relatedEntity: relatedEntity.fullName } );
        };

        $scope.performAction = function(action) {
            if (action.parameters.length > 0) {
                $state.go(kirraNG.toState(entity.fullName, 'performInstanceAction'), { objectId: objectId, actionName: action.name } );
                return;
            }
            instanceService.performInstanceAction(entity, objectId, action.name).then(
                function() { return instanceService.get(entity, objectId); }
            ).then($scope.loadInstanceCallback).then($scope.loadInstanceRelatedCallback);
        };

        /*
        Data for multivalued relationships is kept in the form of edgeDatas.
        An edgeData is meant to be bound to a scope, and is the basis for dynamic UI rendering.
        The edgeData includes both metadata about the relationship,
        and the data for that relationship (rows). 
        */
        var buildEdgeData = function(relationship) {
            var relatedEntity = entitiesByName[relationship.typeRef.fullName];
            /*
             Data for multivalued relationships is kept in the form of edgeDatas.
             An edgeData is meant to be bound to a scope, and is the basis for dynamic UI rendering.
             The edgeData includes both metadata about the relationship,
             and the data for that relationship (rows). 
             */
            var newArrayWithTimestamp = [];
            newArrayWithTimestamp.timestamp = new Date();
            var edgeData = {
                relationshipLabel: relationship.label,
                relationshipStyle: relationship.style,
                relationship: relationship, 
                relatedEntity: relatedEntity,
                relatedTableProperties: kirraNG.buildTableColumns(relatedEntity),
                relatedInstanceActions: kirraNG.getInstanceActions(relatedEntity),
                performRelatedInstanceActionOnRow: function(row, action) {
                    var relatedObjectId = row.raw.objectId;
                    var shorthand = row.raw.shorthand; 
                    
                    if (action.parameters.length > 0) {
                        $state.go(kirraNG.toState(relatedEntity.fullName, 'performInstanceAction'), { objectId: relatedObjectId, shorthand: shorthand, actionName: action.name } );
                        return;
                    }
                  
                    instanceService.performInstanceAction(relatedEntity, relatedObjectId, action.name).then(
                        function() { return instanceService.get(entity, objectId); }
                    ).then($scope.loadInstanceCallback).then($scope.loadInstanceRelatedCallback);
                },
                rows: []
            };
            return edgeData;
        };
        
        var childRelationships = kirraNG.getMultiChildRelationships(entity);
        var regularRelationships = kirraNG.getMultiRegularRelationships(entity);
        var multipleRelationships = childRelationships.concat(regularRelationships);
        
        var edgeDatas = kirraNG.map(multipleRelationships, buildEdgeData);
        $scope.edges = edgeDatas; 
        
        $scope.loadInstanceRelatedCallback = function(relationshipData) {
            var relationshipTasks = [];
             
            angular.forEach(multipleRelationships, function(relationship) {
                var relatedEntity = entitiesByName[relationship.typeRef.fullName];
                var edgeData = kirraNG.find(edgeDatas, function (edgeData) { return edgeData.relationship == relationship });
                // take subtyping into account (every concrete subtype gets its own edgeData
                if (edgeData.relatedEntity.subTypes && edgeData.relatedEntity.subTypes.length > 0) {
                    angular.forEach(edgeData.relatedEntity.subTypes, function (subType) {
                        var subEntity = entitiesByName[subType.fullName];
                        if (subEntity.concrete) {
                            //TODO-RC this is inconsistent - use a single function to build edgeData 
                            edgeDatas.push({
                                relationshipLabel: relationship.label + " (" + subType.typeName + ")",
                                relationship: relationship, 
                                relatedEntity: subEntity, 
                                rows: [] 
                            });
                        }
                    });
                }
                
                var next = instanceService.getRelated(entity, objectId, relationship.name).then(function(relatedInstances) {
                    // the list of related instances may be heterogeneous - need to find the proper edgeData object to inject the results into
                    var tableData = kirraNG.buildTableData(relatedInstances);
                    kirraNG.mergeEdgeRowDatas(edgeData.rows, tableData);
                });
                relationshipTasks.push(next);
            });
            return $q.all(relationshipTasks);
        };

        instanceService.get(entity, objectId).then($scope.loadInstanceCallback).then($scope.loadInstanceRelatedCallback);
    };
    controller.$inject = ['$scope', '$state', '$stateParams', 'instanceService', '$q', '$modal'];
    return controller;
};

kirraNG.buildInstanceService = function() {
    var serviceFactory = function($rootScope, $http) {
        var Instance = function (data) {
            angular.extend(this, data);
        };
        var buildInstanceFromData = function(instanceData) {
            return new Instance(instanceData);
        };
        var loadOne = function (response) {
            return buildInstanceFromData(response.data);
        };
        var loadMany = function (response) {
            var instances = [];
            angular.forEach(response.data.contents, function(data){
                instances.push(buildInstanceFromData(data));
            });
            return instances;
        };
        
        var removeNulls = function(representation) {
            if (!representation) {
                return {};
            }
            return representation;
        };
        
        var removeNullsFromInstance = function(instance) {
            if (!instance) {
                return {};
            }
            removeNulls(instance.values);
            return instance;
        };
        Instance.performInstanceAction = function(entity, objectId, actionName, arguments) {
            return $http.post(entity.instanceActionUriTemplate.replace('(objectId)', objectId).replace('(actionName)', actionName), removeNulls(arguments));
        };
        Instance.performEntityAction = function(entity, actionName, arguments) {
            return $http.post(entity.entityActionUriTemplate.replace('(actionName)', actionName), removeNulls(arguments));
        };    
        Instance.unlink = function(entity, objectId, relationshipName, relatedObjectId) {
            return $http.delete(entity.relatedInstanceUriTemplate.replace('(objectId)', objectId).replace('(relationshipName)', relationshipName).replace('(relatedObjectId)', relatedObjectId), {});
        };
        Instance.link = function(entity, objectId, relationshipName, relatedObjectId) {
            return $http.put(entity.relatedInstanceUriTemplate.replace('(objectId)', objectId).replace('(relationshipName)', relationshipName).replace('(relatedObjectId)', relatedObjectId), {}).then(loadOne);
        };
        Instance.extent = function (entity) {
            var extentUri = entity.extentUri;
            return $http.get(extentUri).then(loadMany);
        };
        Instance.performQuery = function (entity, finderName, arguments) {
            var finderUri = entity.finderUriTemplate.replace('(finderName)', finderName);
            return $http.post(finderUri, arguments || {}).then(loadMany);
        };
        Instance.getRelationshipDomain = function (entity, objectId, relationshipName) {
            var relationshipDomainUri = entity.relationshipDomainUriTemplate.replace('(objectId)', objectId).replace('(relationshipName)', relationshipName);
            return $http.get(relationshipDomainUri).then(loadMany);
        };
        Instance.getParameterDomain = function (entity, objectId, actionName, parameterName) {
            var parameterDomainUri = entity.instanceActionParameterDomainUriTemplate.replace('(objectId)', objectId).replace('(actionName)', actionName).replace('(parameterName)', parameterName);
            return $http.get(parameterDomainUri).then(loadMany);
        };
        
        Instance.get = function (entity, objectId) {
            var instanceUri = entity.instanceUriTemplate.replace('(objectId)', objectId);
            return $http.get(instanceUri).then(loadOne);
        };
        Instance.put = function (entity, instance) {
            return $http.put(entity.instanceUriTemplate.replace('(objectId)', instance.objectId), removeNullsFromInstance(instance)).then(loadOne);
        };
        Instance.delete = function (entity, objectId) {
            return $http.delete(entity.instanceUriTemplate.replace('(objectId)', objectId));
        };
        Instance.post = function (entity, instance) {
            return $http.post(entity.extentUri, removeNullsFromInstance(instance)).then(loadOne);
        };
        Instance.getRelated = function (entity, objectId, relationshipName) {
            var relatedInstancesUri = entity.relatedInstancesUriTemplate.replace('(objectId)', objectId).replace('(relationshipName)', relationshipName);
            return $http.get(relatedInstancesUri).then(loadMany);
        };
        Instance.getInstanceCapabilities = function (entity, objectId) {
            return $http.get(entity.instanceCapabilityUriTemplate.replace('(objectId)', objectId));
        };
        Instance.getEntityCapabilities = function (entity) {
            return $http.get(entity.entityCapabilityUri);
        };
        Instance.getNewBlobUri = function (entity, propertyName, objectId) {
            var newAttachmentUri = entity.instanceNewBlobUriTemplate.replace('(objectId)', objectId).replace('(propertyName)', propertyName);
            return newAttachmentUri;
        };
        Instance.getBlobUri = function (entity, propertyName, objectId, token) {
            var blobUri = entity.instanceExistingBlobUriTemplate.replace('(objectId)', objectId).replace('(propertyName)', propertyName).replace('(token)', token);
            return blobUri;
        };
        Instance.deleteBlob = function (entity, propertyName, objectId, token) {
            var blobUri = entity.instanceExistingBlobUriTemplate.replace('(objectId)', objectId).replace('(propertyName)', propertyName).replace('(token)', token);
            return $http.delete(blobUri);
        };
        return Instance;
    };
    return serviceFactory;
};

kirraNG.loginController = function($scope, $http, $modalInstance) {
    $scope.ok = function() {
        console.log("Ok pressed");
        $modalInstance.close($scope.credentials);
    };
    $scope.credentials = {};
};


kirraNG.registrationController = function($scope, $http, $modalInstance, $controller, registrationEntity) {
	var entityName = registrationEntity.fullName
	$scope.credentials = { username: "", password: "" };
	$controller(entityName + 'InstanceCreateCtrl', {$scope: $scope});
    $scope.ok = function() {
        console.log("Save pressed");
        var newValues = angular.copy($scope.propertyValues);
        console.log(newValues);
        var newLinks = angular.copy($scope.linkValues);
        var newRepresentation = { values: newValues, links: newLinks };
        console.log("newRepresentation");
        console.log(newRepresentation);
        $modalInstance.close({ instance: newRepresentation, credentials: $scope.credentials });
    };
    $scope.cancel = function() {
    	$modalInstance.dismiss();
    };
};


kirraModule = angular.module('kirraModule', ['ui.bootstrap', 'ui.router', 'ui.uploader', 'ui.toggle', 'bootstrapLightbox']);

kirraModule.factory('kirraNotification', function($rootScope) {
    var listeners = [];
    var Notification = function () {
        this.listeners = [];
        angular.extend(this);
    };
    Notification.addListener = function(listener) {
        listeners.push(listener);
    };
    Notification.logError = function(error) {
        angular.forEach(listeners, function(it) {
            it.handleError && it.handleError(error);
        });
    };
    Notification.logInfo = function(info) {
        angular.forEach(listeners, function(it) {
            it.handleInfo && it.handleInfo(info);
        });
    };
    return Notification;
});

kirraModule.service('loginDialog', function($rootScope, $modal, $http, $state, kirraNotification) {
    var LoginDialog = function () {
        angular.extend(this);
    };
    LoginDialog.showing = false;
    LoginDialog.show = function() {
        var dialog = this;
        if (this.showing) {
            return;
        }
        this.showing = true;
        this.modal = $modal.open({
          animation: true,
          templateUrl: 'templates/login.html',
          size: 'sm',
          controller: 'LoginCtrl'
        });
        this.modal.result.then(function(credentials) {
            dialog.showing = false;
            if (credentials) {
                encodedCredentials = btoa(credentials.username+":"+credentials.password);
                return $http.post(application.uri + 'session/login', {}, { headers: { Authorization: "Custom " + encodedCredentials }});
            }
        }, function() {
        	// dismissed? reload in case we were here because the user tried to access a protected resource
            window.location.href = application.viewUri;
            window.location.reload();
        }).then(function(loginResponse) {
            if (loginResponse) {
            	if (loginResponse.status >= 200 && loginResponse.status < 300) {
	                // before reloading, send the user to the dashboard.
	                window.location.href = application.viewUri;
	                window.location.reload();
            	} else {
                	console.log("Error 1!");
                	console.log(errorResponse);
            	}
            }
        }, function(errorResponse) {
    		kirraNotification.logError(errorResponse);	
        });
    };
    LoginDialog.close = function() {
        if (this.showing && this.modal) {
            this.modal.close();
        }
        this.showing = false;
        delete this.modal;
    };
    return LoginDialog;
});

kirraModule.service('registrationDialog', function($rootScope, $modal, $http, $state) {
    var RegistrationDialog = function () {
        angular.extend(this);
    };
    RegistrationDialog.showing = false;
    RegistrationDialog.show = function(registrationEntity) {
        var dialog = this;
        if (this.showing) {
            return;
        }
        this.showing = true;
        this.modal = $modal.open({
          animation: true,
          templateUrl: 'templates/registration.html',
          size: 'sm',
          controller: 'RegistrationCtrl',
          resolve: {
              registrationEntity: function () {
                return registrationEntity;
              }
            }
        });
        this.modal.result.then(function(modalResult) {
        	var instance = modalResult.instance;
        	var credentials = modalResult.credentials;
            dialog.showing = false;
            encodedCredentials = btoa(credentials.username+":"+credentials.password);
            return $http.post(application.uri + 'signup/' + registrationEntity.fullName, instance, { headers: { "X-Kirra-Credentials": encodedCredentials }});
        }, function() {
        	// dismissed? reload in case we were here because the user tried to access a protected resource
            window.location.href = application.viewUri;
            window.location.reload();
        }).then(function(loginResponse) {
            if (loginResponse && loginResponse.status >= 200 && loginResponse.status < 300) {
                window.location.reload();
            }
        });
    };
    RegistrationDialog.close = function() {
        if (this.showing && this.modal) {
            this.modal.close();
        }
        this.showing = false;
        delete this.modal;
    };
    
    return RegistrationDialog;
});

kirraModule.config(function($httpProvider) {
    $httpProvider.interceptors.push(function($q, kirraNotification, $injector) {
        return {
            responseError: function(rejection) {
                if (rejection.status == 401) {
                    console.log('Unauthorized: ');
                    console.log(rejection);
                    $injector.get('loginDialog').show();
                } else {
                    kirraNotification.logError(rejection);
                }
                return $q.reject(rejection);
            }
        };
    });
    $httpProvider.defaults.withCredentials = true;
    $httpProvider.defaults.headers.common["X-Requested-With"] = 'XMLHttpRequest';
    $httpProvider.defaults.headers.common["Cache-control"] = 'no-cache';
});

kirraModule.controller('KirraBaseCtrl', function($scope, kirraNotification) {
    $scope.kirraNG = kirraNG;
    $scope.alerts = [];
    
    $scope.addAlert = function(type, message) {
        $scope.alerts.push({type: type, msg: message});
    };

    $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
    };
    
    $scope.logError = function(error) {
        var message = (error.data && error.data.message) || error.statusText;
        if (!message) {
            message = "Unexpected error (status code: " + error.status + ")";
        }
        this.addAlert('danger', message);
    };
    
    $scope.clearAlerts = function() {
        $scope.alerts = [];
    };
    
    this.handleError = function(error) {
        $scope.logError(error);
    };
    
    kirraNotification.addListener(this);
});

    
repository.loadApplication(function(loadedApp, status) {
    if (status != 200) {
        console.log(loadedApp);
        kirraModule.controller('KirraRepositoryCtrl', function($scope, kirraNotification) {
            $scope.applicationLabel = "Application not found or not available: " + applicationUrl;
            $scope.entities = [];
            $scope.entityCapabilities = [];
            $scope.applicationOptions = {};
            $scope.smallScreen = window.innerWidth < 768;
        });
        angular.element(document).ready(function() {
          angular.bootstrap(document, ['kirraModule']);
        });
        return;
    }
    application = loadedApp;
    document.title = application.applicationLabel;
            
    var buildUI = function(entities, entityCapabilities, status) {
        
        kirraModule.controller('KirraRepositoryCtrl', function($http, $scope, kirraNotification, instanceService, loginDialog, registrationDialog) {
        	$scope.applicationLogo = application.applicationLogo;
            $scope.applicationName = application.applicationName;
            $scope.applicationLabel = application.applicationLabel || application.applicationName;
            var querylessUri = window.location.href.split(/[?#]/)[0];
            $scope.applicationUrl = application.viewUri = querylessUri + '?app-uri=' + application.uri + '#/';
            $scope.entities = entities;
            $scope.selfServiceRoleEntities = kirraNG.filter(entities, function(entity) {
            	return entity.role && entityCapabilities[entity.fullName].entity.indexOf('Create') >= 0;
            });
            $scope.applicationOptions = application.options;            
            $scope.kirraNG = kirraNG;
            $scope.currentUser = undefined;
            console.log(entityCapabilities);
            $scope.logout = function() {
                console.log("Logging out");
                $http.get(application.uri + "session/logout").then(function(loaded) {
                    window.location.reload();
                });
            };
            $scope.login = function() {
               console.log("Log-in requested");
               registrationDialog.close();
               loginDialog.show();
            };
            $scope.registerAs = function(entity) {
               console.log("Sign-up requested");
               loginDialog.close();
               registrationDialog.show(entity);
            };
            
            $scope.canChangeTheme = canChangeTheme;
            
            $scope.changeTheme = function(theme) {
                
                changeTheme(theme);
            };            
            
            $scope.entityLabel = function(entityName) {
                var entity = entitiesByName[entityName];
                return entity ? entity.label : entityName;
            };
            
            console.log(application);
            if (application.currentUser) {
                $http.get(application.currentUser).then(function(loaded) {
                    $scope.currentUser = loaded.data;
                });
            }
            
            if (status != 200 || (!application.currentUser && application.options && application.options.isLoginRequired)) {
                loginDialog.show();
            }
        });
        
        kirraModule.directive('instanceTable', ['$window', function($window) {
            return {
            	restrict: 'E',
	            template: '<div ng-include="templateUrl"></div>',
	            link: function(scope) {
	
	                $window.onresize = function() {
	                    changeTemplate();
	                    scope.$apply();
	                };
	                changeTemplate();
	
	                function changeTemplate() {
	                    var screenWidth = $window.innerWidth;
	                    if (screenWidth < 768) {
	                        scope.templateUrl = 'templates/instance-table-mobile.html';
	                    } else {
	                        scope.templateUrl = 'templates/instance-table-desktop.html';
	                    }
	                }
	            }
            }
        }]);
        
        kirraModule.directive('kaData', function(uiUploader, instanceService, kirraNotification, $state, $sce, Lightbox) {
            return {
                restrict: 'E',
                scope: {
                    // these are set at the directive call site
                    slot: '=',
                    slotData: '=',
                    objectId: '=',
                    table: '=',
                    
                },
                link: function (scope, element) {
                    var slot = scope.slot;
                    var slotData = scope.slotData;
                    var objectId = scope.objectId;
                    var isTable = scope.table;
                    scope.slotTypeName = slot.typeRef.typeName;
                    scope.slotTypeKind = slot.typeRef.kind;
                    
                    if (slot.mnemonic || slot.unique) {
                        if (!isTable && slot.typeRef.kind == 'Entity') {
                            scope.targetObjectId = slotData && slotData.objectId ;
                            scope.targetStateName = kirraNG.toState(slot.typeRef.fullName, 'show');
                        } else if (objectId) {
                            scope.targetObjectId = objectId;
                            scope.targetStateName = kirraNG.toState(slot.owner.fullName, 'show');
                        }
                    } else if (slot.typeRef.kind == 'Entity') {
                        scope.targetObjectId = slotData && slotData.objectId ;
                        scope.targetStateName = kirraNG.toState(slot.typeRef.fullName, 'show');
                    } else if (slot.typeRef.kind == 'Blob') {
                        element.on('change', function(e) {
                            var fileInput = document.getElementById(slot.name + 'FileInput');
                            var files = fileInput.files;
                            scope.files = files;
                            scope.$apply();
                        });                        
                        scope.attachmentUpload = function(slot, files) {
                            uiUploader.addFiles(files);
                            uiUploader.startUpload({
                                url: instanceService.getNewBlobUri(entitiesByName[slot.owner.fullName], slot.name, objectId  || scope.$parent.$parent.objectId),
                                onProgress: function(file) {
                                    scope.$apply();
                                },
                                onCompleted: function(file, response, status) {
                                    if (status >= 400) {
                                        kirraNotification.logError({ data: JSON.parse(response) });
                                    }
                                    $state.go($state.current.name, $state.params, { reload: true });
                                }
                            });
                        };
                        scope.attachmentCancel = function(slot, slotData, files) {
                            var fileInput = document.getElementById(slot.name + 'FileInput');
                            delete fileInput.files;
                            fileInput.value = '';
                            scope.files = undefined;
                        };
                        scope.attachmentRemove = function(slot, slotData, files) {
                            instanceService.deleteBlob(entitiesByName[slot.owner.fullName], slot.name, objectId  || scope.$parent.$parent.objectId, slotData.token).then(function() {
                                $state.go($state.current.name, $state.params, { reload: true });
                            });
                        };
                        scope.getAttachmentDownloadUri = function(slot, slotData) {
                            return instanceService.getBlobUri(entitiesByName[slot.owner.fullName], slot.name, objectId  || scope.$parent.$parent.objectId, slotData.token);
                        };
                        scope.attachmentShow = function (slot, slotData) {
                            Lightbox.openModal([{
                                url: this.getAttachmentDownloadUri(slot, slotData)
                            }], 0);
                        };
                    } else if (slot.typeRef.typeName == 'Geolocation') {
                        scope.generateMapURL = function (slot, slotData) {                            
                            var apiKey = 'AIzaSyBUQJBhKMkuWFXWs695GPI5Wlm22ybONs0';
                            var urlTemplate = "https://www.google.com/maps/embed/v1/place?key={apiKey}&q={geolocation}&zoom=19&maptype=satellite";
                            var url = urlTemplate.replace('{geolocation}', slotData).replace('{apiKey}', apiKey);
                            return $sce.trustAsResourceUrl(url);
                        };
                        scope.getMapAsImageURL =  function (slot, slotData) {
                            var apiKey = 'AIzaSyBUQJBhKMkuWFXWs695GPI5Wlm22ybONs0';
                            var urlTemplate = "https://maps.googleapis.com/maps/api/staticmap?zoom=15&size=300x300&maptype=roadmap&markers={geolocation}&key=AIzaSyBUQJBhKMkuWFXWs695GPI5Wlm22ybONs0";
                            var url = urlTemplate.replace('{geolocation}', slotData).replace('{apiKey}', apiKey);
                            return url; //$sce.trustAsResourceUrl(url);
                        };
                        scope.setToMyLocation = function (slot, slotData) {
                            if (!navigator.geolocation) {
                                alert("Geolocation is not supported by this browser.");
                                return;
                            }
                            var objectId = scope.$parent.objectId;
                            navigator.geolocation.getCurrentPosition(function(position) {
                                instanceService.get(
                                    entitiesByName[slot.owner.fullName],
                                    objectId
                                ).then(function(loaded) {
                                    loaded.values[slot.name] = position.coords.latitude + "," + position.coords.longitude;
                                    return instanceService.put(
                                        entitiesByName[slot.owner.fullName], 
                                        loaded);
                                }).then(function() {
                                    $state.go($state.current.name, $state.params, { reload: true });
                                }).catch(function(error) {
                                    kirraNotification.logError(error);
                                });
                            }, function(positionError) {
                                alert("Error obtaining geolocation: " + positionError.message);
                            });
                        };
                    };
                    
                },
                templateUrl: 'templates/ka-data.html'
            };
        });
        
        kirraModule.controller('DashboardCtrl', kirraNG.buildDashboardController());
        
        angular.forEach(entitiesByName, function (entity, entityName) {
            kirraModule.controller(entityName + 'InstanceShowCtrl', kirraNG.buildInstanceShowController(entity));
            kirraModule.controller(entityName + 'InstanceLinkCtrl', kirraNG.buildInstanceLinkController(entity));                
            kirraModule.controller(entityName + 'InstanceEditCtrl', kirraNG.buildInstanceEditController(entity, 'edit'));
            kirraModule.controller(entityName + 'InstanceCreateCtrl', kirraNG.buildInstanceEditController(entity, 'create'));
            kirraModule.controller(entityName + 'InstanceEditChildCtrl', kirraNG.buildInstanceEditController(entity, 'editChild'));
            kirraModule.controller(entityName + 'InstanceCreateChildCtrl', kirraNG.buildInstanceEditController(entity, 'createChild'));            
            kirraModule.controller(entityName + 'ActionCtrl', kirraNG.buildActionController(entity));
            kirraModule.controller(entityName + 'InstanceListCtrl', kirraNG.buildInstanceListController(entity));
        });
        
        
        kirraModule.controller('LoginCtrl', kirraNG.loginController);
        kirraModule.controller('RegistrationCtrl', kirraNG.registrationController);
        
        kirraModule.factory('instanceService', kirraNG.buildInstanceService());
        
        kirraModule.config(function($stateProvider, $urlRouterProvider) {
            var first = entityNames.find(function(name) { return entitiesByName[name].topLevel });
            $urlRouterProvider.otherwise("/dashboard/");

            $stateProvider.state('dashboard', {
                url: "/dashboard/",
                controller: 'DashboardCtrl',
                templateUrl: 'templates/dashboard.html'
            });
            
            angular.forEach(entityNames, function(entityName) {
                var entity = entitiesByName[entityName];
                $stateProvider.state(kirraNG.toState(entityName, 'list'), {
                    url: "/" + entityName + "/",
                    controller: entityName + 'InstanceListCtrl',
                    templateUrl: 'templates/instance-list.html'
                });
                $stateProvider.state(kirraNG.toState(entityName, 'show'), {
                    url: "/" + entityName + "/:objectId/show",
                    controller: entityName + 'InstanceShowCtrl',
                    templateUrl: 'templates/show-instance.html',
                    params: { objectId: { value: undefined } }
                });
                $stateProvider.state(kirraNG.toState(entityName, 'edit'), {
                    url: "/" + entityName + "/:objectId/edit",
                    controller: entityName + 'InstanceEditCtrl',
                    templateUrl: 'templates/edit-instance.html',
                    params: { objectId: { value: undefined } }
                });
                $stateProvider.state(kirraNG.toState(entityName, 'create'), {
                    url: "/" + entityName + "/create",
                    controller: entityName + 'InstanceCreateCtrl',
                    templateUrl: 'templates/edit-instance.html'
                });
                $stateProvider.state(kirraNG.toState(entityName, 'editChild'), {
                    url: "/" + entityName + "/:objectId/editChild/:relationshipName/:childObjectId",
                    controller: entityName + 'InstanceEditChildCtrl',
                    templateUrl: 'templates/edit-instance.html',
                    params: { childObjectId: { value: undefined }, objectId: { value: undefined }, relationshipName: { value: undefined } }
                });
                $stateProvider.state(kirraNG.toState(entityName, 'createChild'), {
                    url: "/" + entityName + "/:objectId/createChild/:relationshipName/as/:relatedEntity",
                    controller: entityName + 'InstanceCreateChildCtrl',
                    templateUrl: 'templates/edit-instance.html',
                    params: { objectId: { value: undefined }, relationshipName: { value: undefined } }
                });                
                $stateProvider.state(kirraNG.toState(entityName, 'performInstanceAction'), {
                    url: "/" + entityName + "/:objectId/perform/:actionName",
                    controller: entityName + 'ActionCtrl',
                    templateUrl: 'templates/execute-action.html',
                    params: { objectId: { value: undefined }, actionName: { value: undefined } }
                });                
                $stateProvider.state(kirraNG.toState(entityName, 'performEntityAction'), {
                    url: "/" + entityName + "/perform/:actionName",
                    controller: entityName + 'ActionCtrl',
                    templateUrl: 'templates/execute-action.html',
                    params: { actionName: { value: undefined } }
                });                
                $stateProvider.state(kirraNG.toState(entityName, 'performQuery'), {
                    url: "/" + entityName + "/finder/:finderName",
                    controller: entityName + 'InstanceListCtrl',
                    templateUrl: 'templates/instance-list.html',
                    params: { finderName: { value: undefined }, arguments: { value: undefined }, forceFetch: { value: false } }
                });
            }); 
        });
        
        angular.element(document).ready(function() {
          angular.bootstrap(document, ['kirraModule']);
        });
    };
    
    repository.loadEntities(function(loadedEntities) {
        entitiesByName = {};
        entityCapabilitiesByName = {};
        entityNames = [];
        entities = loadedEntities;
        
        angular.forEach(loadedEntities, function(entity) {
            entitiesByName[entity.fullName] = entity;
            entityCapabilitiesByName[entity.fullName] = {};
            entityNames.push(entity.fullName);
        });
        
        repository.loadEntityCapabilities(function(loadedEntityCapabilities, status) {
            if (status == 200) {
                entityCapabilitiesByName = loadedEntityCapabilities;
                angular.forEach(entityCapabilitiesByName, function(capabilities, entityName) {
                    var actualAccessibleQuery = kirraNG.find(capabilities.queries, function (queryCaps, queryName) {
                        var query = entitiesByName[entityName].operations[queryName]; 
                        return queryCaps.length && query.multiple && query.typeRef.kind == "Entity";
                    });
                    if (capabilities.entity.indexOf('List') < 0 && (!Object.keys(capabilities.queries).length || !actualAccessibleQuery)) {
                        entitiesByName[entityName].forbidden = true;
                    }
                });
                buildUI(loadedEntities, loadedEntityCapabilities, status);
            } else {
                buildUI(loadedEntities, {}, status);
            }
        });
    });    
});                
