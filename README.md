**kirra-angular** is a generic HTML5/JavaScript(Angular) client for any application exposing their domain model as a [Kirra-compliant](///github.com/abstratt/kirra/blob/master/readme.md) REST API. 

kirra-angular provides a generic Angular admin application that renders a UI dynamically based on the 
application schema that is discovered using the back-end (Kirra-based) REST API.

This is still in early development, many features are missing. You can try it out against any Cloudfier-based application using URLs like these:

* [Taxi Fleet](http://develop.cloudfier.com/kirra-api/kirra-ng/?app-uri=http://develop.cloudfier.com/services/api-v2/test-cloudfier-examples-taxi-fleet)
* [Car Service](http://develop.cloudfier.com/kirra-api/kirra-ng/?app-uri=http://develop.cloudfier.com/services/api-v2/test-cloudfier-examples-carserv)
* [Car rental](http://develop.cloudfier.com/kirra-api/kirra-ng/?app-uri=http://develop.cloudfier.com/services/api-v2/test-cloudfier-examples-car-rental)
* [Expenses](http://develop.cloudfier.com/kirra-api/kirra-ng/?app-uri=http://develop.cloudfier.com/services/api-v2/test-cloudfier-examples-expenses)
* [Ship It](http://develop.cloudfier.com/kirra-api/kirra-ng/?app-uri=http://develop.cloudfier.com/services/api-v2/test-cloudfier-examples-shipit)

### Screenshots  

#### Navigation and list views

For each top-level entity defined in the application, a menu entry is rendered at the top of the screen.
This menu entry takes the user to the list view for the corresponding entity.

The list view is a table showing (by default) all instances of that entity, with no filtering.

![Taxi All](docs/images/taxi-list-all.png)

#### Filtering

Entities may define queries, which are also exposed in the list UI. 

![Taxi Avalable](docs/images/taxi-list-available.png)

#### Filtering (with parameters)

When a query prescribe parameters, users must provide them before the query can be executed. 

![Taxi Avalable](docs/images/charge-list-by-taxi.png)


#### Detail view

From a list view, you can open the details for any of the instances.
The details view shows the basic data, child objects, relationships
and any (instance-level) actions available.  

![Taxi details](docs/images/taxi-show.png)

![Driver details](docs/images/driver-show.png)

#### Edit view

From the detail view, you can open the edit view to edit the user details.  

![Driver details](docs/images/driver-edit.png)


#### Instance actions

 When an entity describes instance actions, they are triggerable from the details view, 
 and from the list view. 

![Driver booking a taxi](docs/images/driver-book.png)

#### Entity actions

When an entity defines an entity-level action (a.k.a. static operation), the actions are exposed in the list view.

![New charge](docs/images/new-charge.png) 


