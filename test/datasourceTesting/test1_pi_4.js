/* 
/* 
This is the code to generate ajv.json, the stage I datasource schema validation
requires: mongoose
          ../collection_counts.json.json generated by generate_collections_counts.js
          ../schemas.json
Purposes
        - substratify the entire collections to dataType collections
          and run schemas.json ajv validation on each collection 
          error message at the document level will be reported
*/
console.time();
const mongoose = require("mongoose");
const jsonfile = require("jsonfile");
const u = require("underscore");
const helper = require("/usr/local/airflow/docker-airflow/onco-test/testingHelper.js");
const dataTypeMapping = require("/usr/local/airflow/docker-airflow/onco-test/lookup_dataTypes.json");
const schemas = require("/usr/local/airflow/docker-airflow/onco-test/schemas.json");
const Ajv = require('ajv');
var ajv = new Ajv({allErrors: true});
const asyncLoop = require('node-async-loop');
var collections = require("/usr/local/airflow/docker-airflow/onco-test/manifest_arr.json");
var table_name;
var msg_type = {};
var ajvMsg = [];
var ajvMsg_v2 = [];
var passed_elem;
var error_elem = [];
var elem = {};
var col_count = 0;
var xena_dataTypes = dataTypeMapping.map(function(m){return m.dataType;});
var xena_dataTypes_included = dataTypeMapping.filter(function(m){return m.class== 'cnv' || m.class== 'mut01' || m.class == 'cnv_thd' || m.class == 'expr'}).map(function(m){return m.dataType;});
var xena_dataTypes_excluded = u.difference(xena_dataTypes, xena_dataTypes_included);
var dataType = u.difference(collections.map(function(m){return m.dataType;}).unique(), xena_dataTypes_excluded);
var manifest_xena_dataTypes = collections.filter(function(m){return m.source == 'ucsc xena'}).map(function(m){return m.dataType;}).unique();
var dataTypes_inManifestXena_notInXena = u.difference(manifest_xena_dataTypes, xena_dataTypes);
var dataType = u.difference(dataType, dataTypes_inManifestXena_notInXena).splice(26, 15);
var dataType_length = dataType.length;
var connection = mongoose.connection;

mongoose.connect(
    'mongodb://oncoscape-dev-db1.sttrcancer.io:27017,oncoscape-dev-db2.sttrcancer.io:27017,oncoscape-dev-db3.sttrcancer.io:27017/tcga?authSource=admin', {
        db: {
            native_parser: true
        },
        server: {
            poolSize: 5,
            reconnectTries: Number.MAX_VALUE
        },
        replset: {
            rs_name: 'rs0'
        },
        user: 'oncoscapeRead',
        pass: 'i1f4d9botHD4xnZ'
    });


connection.once('open', function(){
    var db = connection.db; 
    asyncLoop(dataType, function(t, next){  
      //t = 'events';
      console.log("Within datatype: ", t);
      var categoried_collections = collections.findCollectionsByType(t); 
      var categoried_collection_length = categoried_collections.length; 
      var category_index = 0;

      var processNextTable = function(){
        var tableName = categoried_collections[category_index];
        console.log(tableName);
        console.log("test" , col_count++);
        var collection = db.collection(tableName);
        var cursor = collection.find();
        count = 0;
        msg_type = {};
        passed_elem = 0;
        error_elem = [];
        elem = {};
        var schema;
        if(t in schemas){
          schema = schemas[t];
        }else{
          var tt = dataTypeMapping.filter(function(m){return m.dataType == t})[0].schema;
          console.log(tt);
          schema = schemas[tt];
          if(typeof(schemas[tt]) == 'undefined'){
            next();
          }
        }
        cursor.each(function(err, item){
              if(item != null){
                count++;
                if("dataType" in item){
                  schema = schemas[item.dataType];
                }
                var valid = ajv.validate(schema, item);
                if(!valid){
                  var e = {};
                  console.log("&&&NEW ERRORS&&&");
                  console.log(ajv.errors);
                  console.log("***PRINT DOCUMENT***");
                  console.log(item['_id']);
                  console.log("**END OF ERROR MSG**");
                  e.errorType = ajv.errors; 
                  error_elem.push(e);
                }
                else{
                  passed_elem++;
                }
                msg_type.collection = tableName;
                msg_type.type = t;
                msg_type.disease = tableName.split('_')[0];
                msg_type.passedCounts = passed_elem;
                msg_type.totalCounts = count;
                msg_type.errors = error_elem;
                ajvMsg[col_count-1] = msg_type;
              }else{// No more items to process So move to the next table
                category_index += 1;
                if (category_index<categoried_collection_length){
                  processNextTable();
                }else{
                  next();
                }
              }
            });
      };
      // Call processNextTable recursively
      if(categoried_collection_length != 0){
        processNextTable();
      }else{
        next();
      }
    }, function (err)
    {
        if (err)
        {
            console.error('Error: ' + err.message);
            return;
        }
        ajvMsg_v2 = ajvMsg.map(function(a){
            var elem = {};
            if(a!=null){
                elem.collection = a.collection;
                elem.type = a.type;
                elem.disease = a.disease;
                elem.passedCounts = a.passedCounts;
                elem.totalCounts = a.totalCounts;
                elem.passedRate = a.passedCounts/a.totalCounts;
                elem.errorMessage = helper.nestedUniqueCount(a);
            }
            
            //elem.errorMessage = a.errors.tableV2(a.nestedUnique());
            return elem;
        });
        //jsonfile.writeFile('ajv_test2.json', ajvMsg_v2, {spaces:4});
        ajvMsg_v2 = ajvMsg_v2.filter(function(m){return m != null;});
        console.log("Number of the empty collections listed in manifest is: ", ajvMsg_v2.filter(function(m){return m==null}).length);
        jsonfile.writeFile("/usr/local/airflow/docker-airflow/onco-test/dataStr/ajv_test2_pi4.json", ajvMsg_v2, {spaces:4}, function(err){ console.error(err);});
        connection.close();
    });

});//6379529ms


