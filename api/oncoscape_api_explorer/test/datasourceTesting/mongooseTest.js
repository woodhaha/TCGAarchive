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
const jsonfile = require("jsonfile-promised");
const helper = require("../testingHelper.js");
const schemas = require("../schemas.json");
const Ajv = require('ajv');
var ajv = new Ajv({allErrors: true});
const asyncLoop = require('node-async-loop');
var collections = require("../manifest_arr.json");
var table_name;
var msg_type = {};
var ajvMsg = [];
var passed_elem;
var error_elem = [];
var elem = {};
var col_count = 0;
var dataType = Object.keys(schemas);
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
        cursor.each(function(err, item){
          if(item != null){
            count++;
            var valid = ajv.validate(schemas[t], item);
            if(!valid){
              var e = {};
              console.log("&&&NEW ERRORS&&&");
              console.log(ajv.errors);
              console.log("***PRINT DOCUMENT***");
              console.log(item);
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
        jsonfile.writeFile("ajv_tcga_11212016.json", ajvMsg, {spaces: 4}); 
        console.log('Finished!');
        console.timeEnd();
    });

});//6379529ms


