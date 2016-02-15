var uriMatches = window.location.search.match("[?&]?app-uri\=(.*)\&?");
var pathMatches = window.location.search.match("[?&]?app-path\=(.*)\&?");
if (!uriMatches && !pathMatches) {
     throw Error("You must specify an application URI or path (same server) using the app-uri or app-path query parameters, like '...?app-uri=http://myserver.com/myapp/rest/' or '...?app-path=/myapp/rest/'.");
}
var applicationUrl = uriMatches ? uriMatches[1] : (window.location.origin + pathMatches[1]);
if (!applicationUrl.endsWith('/')) applicationUrl = applicationUrl + '/';

var repository = kirra.newRepository(applicationUrl);

var kirraNG = {};

var application;
var entitiesByName;
var entityNames;
var kirraModule;

var foo = function(it) { console.log('I was called'); console.log(it); return "foo"; }; 

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
    angular.forEach(arrayOrMap, function(it) {
        if (!found && filter(it)) {
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
    return inputFields;
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
    return viewFields;
};

kirraNG.getEnabledActions = function(instance, instanceActions) {
    return kirraNG.filter(instanceActions, function(action) { 
        return instance.disabledActions[action.name] == undefined;
    });
};

// this version is required to workaround a weird issue were using an object (as the basic buildViewData does) would cause all sorts of problems
kirraNG.buildViewDataAsArray = function(instance, properties, relationships) {
    // need to preserve order to allow retrieval by index
    var fieldValues = [];
    angular.forEach(properties, function(property) {
        if (property.userVisible) {
        	fieldValues.push(instance.values[property.name]);
    	}
    });
    angular.forEach(relationships, function(relationship) {
        if (relationship.userVisible && !relationship.multiple) {
            if (instance.links[relationship.name] && instance.links[relationship.name].length > 0) { 
	            fieldValues.push({
		            shorthand: instance.links[relationship.name][0].shorthand,
		            objectId: instance.links[relationship.name][0].objectId
		        });
        	} else {
        	    fieldValues.push({});    
        	}
    	}
    });
    return fieldValues;
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
	        data[name] = link && link.length > 0 ? {
	            shorthand: link[0].shorthand,
	            objectId: link[0].objectId
	        } : {}
        }
    });
    return data;
};


kirraNG.buildRowData = function(entity, instance, instanceActions) {
    var enabledActions = kirraNG.getEnabledActions(instance, instanceActions);
    var data = kirraNG.buildViewData(entity, instance);
    var row = { 
        data: data, 
        raw: instance, 
        enabledActions: enabledActions,
        useDropdown: enabledActions.length > 2
    };
    return row;
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
    
		$scope.$state = $state;
        $scope.entity = entity;
        $scope.filtered = finderName != undefined;
        $scope.finder = finder;
        $scope.inputFields = finder && finder.parameters;
        $scope.parameterValues = finderArguments || {};
        $scope.entityName = entity.fullName;
        $scope.tableProperties = kirraNG.buildTableColumns(entity);
        $scope.actions = kirraNG.getInstanceActions(entity);
        $scope.instances = undefined;
        $scope.queries = kirraNG.getQueries(entity);
        $scope.entityActions = kirraNG.getEntityActions(entity);
        $scope.toggleDatePicker = function($event, propertyName) { kirraNG.toggleDatePicker($event, $scope, propertyName); };
        $scope.applyFilter = function() {
            var newStateParams = angular.merge({}, $state.params, { arguments: $scope.parameterValues, forceFetch: true });
            $state.go($state.current.name, newStateParams, { reload: true });
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
	                    $scope.resultMessage = instances.length > 0 ? "" : "No instances found";
	                }).catch(function(error) {
	                	$scope.resultMessage = error.data.message;
	                	$scope.clearAlerts();
	            	});
            } else {
                var parameterLabels = kirraNG.map(missingArguments, function (parameterName) {
            		var parameter = kirraNG.find(finder.parameters, function (p) { return p.name == parameterName; });
                	return parameter.label; 
            	});
                $scope.resultMessage = "Before you can apply this filter, you must fill in: " + parameterLabels;
            }
        }; 
        
        if (finder) {
    	    performQuery(finderArguments, forceFetch);
        } else {
	        instanceService.extent(entity).then(function(instances) { 
	        	$scope.instances = instances;
	            $scope.rows = kirraNG.buildTableData(instances, entity);
	            $scope.resultMessage = instances.length > 0 ? "" : "No instances found";
	    	});
        }
        
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

    	$scope.performInstanceAction = function(row, action) {
    	    var objectId = row.raw.objectId;
    	    
    	    if (action.parameters.length > 0) {
    	        $state.go(kirraNG.toState(entity.fullName, 'performInstanceAction'), { objectId: objectId, actionName: action.name } );
    	        return;
    	    }
    	    
    	    var performResult = instanceService.performInstanceAction(entity, objectId, action.name);
    	    if (finder) {
    	        // better reload as the row may no longer satisfy the filter
    	        performResult.then(function() { $state.go($state.current.name, $state.params, { reload: true }); });
    	    } else {
    	        // when showing all, update only the row affected
	    	    performResult.then(
	    	        function() { return instanceService.get(entity, objectId); }
	            ).then(
	                function(instance) {
	                    var newRow = kirraNG.buildRowData(entity, instance, kirraNG.getInstanceActions(entity));
	                    row.data = newRow.data;
	                    row.raw = newRow.raw;
	                    row.enabledActions = newRow.enabledActions;
	                    row.useDropdown = newRow.enabledActions.length > 2;
	                }
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
     
        // in this controller, because it is used both for editing parents and children, the actual entity will depend on the mode   
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
        $scope.entityName = actualEntity.fullName;
        $scope.toggleDatePicker = function($event, propertyName) { kirraNG.toggleDatePicker($event, $scope, propertyName); };

    	$scope.loadInstanceCallback = function(instance) { 
            $scope.formLabel = creation ? ('Creating ' + actualEntity.label) : (childCreation ? ('Adding ' + actualEntity.label) : ('Editing ' + actualEntity.label + ': ' + instance.shorthand)); 
	    	$scope.raw = instance;
	    	$scope.enabledActions = kirraNG.getEnabledActions(instance, kirraNG.getInstanceActions(actualEntity));
	    	$scope.propertyValues = angular.copy(instance.values);
	    	$scope.linkValues = angular.copy(instance.links);
	    	return instance;
		};
    
        $scope.inputFields = kirraNG.buildInputFields(actualEntity, creation);
        
        $scope.findCandidatesFor = function(relationship, value) {
            var domain;
            if (creation || childCreation) {
                var relatedEntity = entitiesByName[relationship.typeRef.fullName];
                domain = instanceService.extent(relatedEntity);
            } else {
                domain = instanceService.getRelationshipDomain(actualEntity, $scope.objectId, relationship.name);
            }
            return domain.then(function(instances) { return kirraNG.filterCandidates(instances, value); });
        };
        
        $scope.onCandidateSelected =  function(selectedCandidate, inputField, $label) {
            $scope.linkValues[inputField.name] = selectedCandidate;
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
            var newValues = angular.copy($scope.propertyValues);
            var newLinks = angular.copy($scope.linkValues);
            var newRepresentation = { values: newValues, links: newLinks };
            if (creation) {
                instanceService.post(actualEntity, newRepresentation).then(function(created) {
                    $state.go(kirraNG.toState(actualEntity.fullName, 'show'), { objectId: created.objectId } ); 
            	});
            } else if (editing || childEditing) {
                newRepresentation.objectId = $scope.objectId;
                instanceService.put(actualEntity, newRepresentation).then(function() { window.history.back(); });
            } else if (childCreation) {
                var relationship = $scope.parentEntity.relationships[$scope.relationshipName];
                newRepresentation.links[relationship.opposite] = [ { objectId: $scope.objectId, scopeName: $scope.parentEntity.name, scopeNamespace: $scope.parentEntity.namespace } ];
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
                instanceService.performEntityAction(entity, actionName, arguments).then(function() { window.history.back(); });
            } else {
                instanceService.performInstanceAction(entity, objectId, actionName, arguments).then(function() { window.history.back(); });
            }
    	};
    };
    controller.$inject = ['$scope', '$state', '$stateParams', 'instanceService', '$q'];
    return controller;
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
        	$modalInstance.close($scope.selected);
        };
        $scope.cancel = function() {
            $modalInstance.dismiss();
        };
	    
	};
	return controller;
};


kirraNG.buildInstanceShowController = function(entity) {
    var multipleRelationships = kirraNG.filter(entity.relationships, function(rel) { return rel.multiple && rel.userVisible; });

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
	    	$scope.enabledActions = kirraNG.getEnabledActions(instance, kirraNG.getInstanceActions(entity));
	    	$scope.fieldValues = kirraNG.buildViewDataAsArray(instance, entity.properties, entity.relationships);
	    	$scope.relatedData = [];
	    	$scope.childrenData = [];
	    	if (!entity.topLevel) {
	    		$scope.parentLink = instance.links[$scope.parentRelationship.name][0];
    		}
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
		    modal.result.then(function(selected) {
		        return instanceService.link(entity, objectId, relationship.name, relatedEntity.fullName + '@' + selected.objectId);
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

    	$scope.loadInstanceRelatedCallback = function(relationship) {
    	    var relationshipTasks = [];
        	angular.forEach(multipleRelationships, function(relationship) {
        	    var edgeData = {
        	        relationshipLabel: relationship.label, 
        	        relationship: relationship, 
        	        relatedEntity: entitiesByName[relationship.typeRef.fullName], 
        	        rows: [] 
    	        };
    	        var edgeDatas = [];
    	        if (edgeData.relatedEntity.concrete) {
    	            edgeDatas.push(edgeData);
    	        }
    	        if (edgeData.relatedEntity.subTypes && edgeData.relatedEntity.subTypes.length > 0) {
    	            angular.forEach(edgeData.relatedEntity.subTypes, function (subType) {
    	                var subEntity = entitiesByName[subType.fullName];
    	                if (subEntity.concrete) {
	    	                edgeDatas.push({
	    	                    relationshipLabel: relationship.label + " (" + subType.typeName + ")",
	    	        	        relationship: relationship, 
	        			        relatedEntity: subEntity, 
	        	    		    rows: [] 
	    	                });
    	                }
    	            });
    	        }
    	        
    	        var edgeList = relationship.style == 'CHILD' ? $scope.childrenData : $scope.relatedData;
    	        angular.forEach(edgeDatas, function(edgeData) {
        	        edgeList.push(edgeData);
    	        });
        	    var next = instanceService.getRelated(entity, objectId, relationship.name).then(function(relatedInstances) {
        	        // the list of related instances may be heterogeneous - need to find the proper edgeData object to inject the results into
        	        var tableData = kirraNG.buildTableData(relatedInstances);
        	        angular.forEach(tableData, function(rowData) {
        	            var edgeData = kirraNG.find(edgeDatas, function(edgeData) {
        	                return edgeData.relatedEntity.fullName == rowData.raw.typeRef.fullName;
        	            });
        	            edgeData.rows.push(rowData);
        	        });
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
            for (var slot in representation) {
                if (representation[slot] == undefined || (typeof representation[slot] == 'string' && representation[slot] == false)) {
                    delete representation[slot];
                }
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
	    return Instance;
    };
    return serviceFactory;
};

kirraModule = angular.module('kirraModule', ['ui.bootstrap', 'ui.router']);

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

kirraModule.config(function($httpProvider) {
    $httpProvider.interceptors.push(function($q, kirraNotification) {
	  return {
	   'responseError': function(rejection) {
	      kirraNotification.logError(rejection);
	      return $q.reject(rejection);
	    }
	  };
	});
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
	        $scope.applicationName = "Application not found or not available: " + applicationUrl;
	        $scope.entities = [];
	    });
        angular.element(document).ready(function() {
	      angular.bootstrap(document, ['kirraModule']);
	    });
        return;
    }
    application = loadedApp;
    document.title = application.applicationName;
	        
    repository.loadEntities(function(loadedEntities) {
        entitiesByName = {};
        entityNames = [];
        
        angular.forEach(loadedEntities, function(entity) {
            entitiesByName[entity.fullName] = entity;
            entityNames.push(entity.fullName);
        });
        
	    kirraModule.controller('KirraRepositoryCtrl', function($scope, kirraNotification) {
	        $scope.applicationName = application.applicationName;
	        $scope.entities = loadedEntities;
	        $scope.kirraNG = kirraNG;
	        
	        $scope.entityLabel = function(entityName) {
	            var entity = entitiesByName[entityName];
	            return entity ? entity.label : entityName;
	        };
	    });
	    
	    kirraModule.directive('kaData', function() {
		    return {
		        restrict: 'E',
		        scope: {
			        slot: '=',
			        slotData: '=',
			        objectId: '='
			    },
			    link: function (scope, element) {
			        var slot = scope.slot;
			        var slotData = scope.slotData;
			        var objectId = scope.objectId;
			        scope.slotTypeName = slot.typeRef.typeName;
			        scope.slotTypeKind = slot.typeRef.kind;
			        if (slot.mnemonic || slot.unique) {
			            if (objectId) {
					        scope.targetObjectId = objectId;
					        scope.targetStateName = kirraNG.toState(slot.owner.fullName, 'show');
				        }
			        } else if (slot.typeRef.kind == 'Entity') {
				        scope.targetObjectId = slotData && slotData.objectId ;
				        scope.targetStateName = kirraNG.toState(slot.typeRef.fullName, 'show');
			        }
			    },
		        templateUrl: 'templates/ka-data.html'
		    };
		});
	    
        angular.forEach(entitiesByName, function(entity, entityName) {
            kirraModule.controller(entityName + 'InstanceShowCtrl', kirraNG.buildInstanceShowController(entity));
            kirraModule.controller(entityName + 'InstanceLinkCtrl', kirraNG.buildInstanceLinkController(entity));                
            kirraModule.controller(entityName + 'InstanceEditCtrl', kirraNG.buildInstanceEditController(entity, 'edit'));
            kirraModule.controller(entityName + 'InstanceCreateCtrl', kirraNG.buildInstanceEditController(entity, 'create'));
            kirraModule.controller(entityName + 'InstanceEditChildCtrl', kirraNG.buildInstanceEditController(entity, 'editChild'));
            kirraModule.controller(entityName + 'InstanceCreateChildCtrl', kirraNG.buildInstanceEditController(entity, 'createChild'));            
            kirraModule.controller(entityName + 'ActionCtrl', kirraNG.buildActionController(entity));
            kirraModule.controller(entityName + 'InstanceListCtrl', kirraNG.buildInstanceListController(entity));
        });
        kirraModule.factory('instanceService', kirraNG.buildInstanceService());
        
        kirraModule.config(function($stateProvider, $urlRouterProvider) {
            var first = entityNames.find(function(name) { return entitiesByName[name].topLevel });
            $urlRouterProvider.otherwise("/" + first + "/");
            
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
    });
});	        	
