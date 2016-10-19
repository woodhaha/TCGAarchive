/* 
    This is the code to generate report_arr.json, tool-based validation
    requires: mongoose
              ajv_v2.json generated by mongooseTest2.js
    Purposes
            - validate the tool accessible according to the collection existence
            - incorperate the datasource quality data into tool validation

*/
var jsonfile = require("jsonfile-promised");
var u = require("underscore");
var test = {
  "pca" : require("./moduleTesting/test_pca.js"),
  "spreadsheet" : require("./moduleTesting/test_Spreadsheet.js"),
  "timelines" : require("./moduleTesting/test_Timelines.js"),
  "clusters" : require("./moduleTesting/test_Clusters.js"),
  "heatmap" : require("./moduleTesting/test_Heatmap.js"),
  "sunburst" : require("./moduleTesting/test_Sunburst.js")
}

var Ajv = require('ajv');
var ajv = new Ajv({allErrors: true});
var ajvMsg = [];
var collection;
var all_collections = [];
var schemas = {};
const mongoose = require("mongoose");
var lookupByDisease = [];
var lookupByTool = [];
var disease_arr = [];
var render_pca;
var render_pca_arr = [];
var render_chr;
var render_chr_arr = [];
var render_pt;
var render_pt_arr = [];
var ajvMsg = [];
var ptList = {};
var diseaseCollectionSchema = {
    "properties": {
        "disease": {"type": "string"}, 
        "source" : {"type": "string", "default": "TCGA"}, 
        "beta" : {"type": ["boolean", "string"]}, 
        "img" : {"type": "string"}, 
        "category": {"type": "array", 
                     "items": {"type": "object", 
                               "properties": {
                                  "source": {"type": "string"}, 
                                  "type": {"type": "string"}, 
                                  "collection": {"type": "string"}
                               },
                                "required": ["source", "type", "collection"]
                             }
                    },
        "molecular": {"type": "array", 
                     "items": {"type": "object", 
                               "properties": {
                                  "source": {"type": "string"}, 
                                  "type": {"type": "string"}, 
                                  "collection": {"type": "string"}
                               },
                                "required": ["source", "type", "collection"]
                             }
                    },
        "calculated": {"type": "array", 
                     "items": {"type": "object", 
                               "properties": {
                                  "source": {"type": "string"}, 
                                  "type": {"type": "string"}, 
                                  "collection": {"type": "string"}
                                },
                                "required": ["source", "type", "collection"]
                             }
                    },
        "clinical": {
                    "properties":{
                       "events": {"type": "string"},
                       "patient": {"type": "string"},
                       "drug": {"type": "string"},
                       "radiation": {"type": "string"},
                       "newTumor": {"type": "string"},
                       "otherMalignancy": {"type": "string"} 
                    },
                    "required": ["events", "patient", "drug", "radiation", "newTumor", "otherMalignancy"],
                    "additionalProperties": true
                    },
         "edges": {"type": "array", 
                     "items": {"type": "object", 
                               "properties": {
                                  "name": {"type": "string"}, 
                                  "source": {"type": "string"}, 
                                  "edges": {"type": "string"},
                                  "patientWeights": {"type": "string"},
                                  "genesWeights": {"type": "string"}
                               },
                                "required": ["name", "source", "edges", "patientWeights", "genesWeights"]
                             }
                    }                                    

    }
    ,
    "required": ["_id", "source", "beta", "name", "molecular", "calculated",  "clinical", "edges"], 
    "additionalProperties": true

};

jsonfile.readFile('../schema.json').then(function(err, obj){schemas = obj;});

jsonfile.readFile('../datasourceTesting/ajv_v2.json').then(function(err, obj){ajvMsg = obj;});

Array.prototype.findCollectionsByDisease = function(d){
  var arr = [];
  for(var i = 0; i < this.length; i++) {
    if(this[i].disease === d){
      arr.push(this[i]);
    } 
  }
  return arr;
};

Array.prototype.unique = function() {
  var arr = [];
  for(var i = 0; i < this.length; i++) {
      if(arr.indexOf(this[i]) === -1) {
          arr.push(this[i]);
      }
  }
  return arr; 
};

Array.prototype.findScoreByDiseaseByType = function(t, d) {
  var passedRateArray = [];
  this.forEach(function(a){
    if(a.type==t && a.disease==d) 
      passedRateArray.push(a.passedRate);
  });
  return passedRateArray;
};

Array.prototype.findScoreByType = function(t) {
  var passedRateArray = [];
  this.forEach(function(a){
    if(a.type==t) 
      passedRateArray.push(a.passedRate);
  });
  return passedRateArray;
};

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

var connection = mongoose.connection;
var j = 0;
var report_arr = [];
var elem = {};
var diseases = [];
var tools = [];

connection.once('open', function(){

    // Testing the disease collection structure using tcga:brain as a gold standard
    // current database : pancan12

    lookupByDisease = connection.db.collection("lookup_oncoscape_datasources").find();
    lookupByDisease.each(function(err, item){
          if(item != null){
            console.log(item['disease']);
            diseases.push(item['disease']);
            disease_arr.push(item);

            //test against tcga:brain element from lookup_oncoscape_datasources
            var valid = ajv.validate(diseaseCollectionSchema, item);
            if(!valid){
              console.log(ajv.errors);
            }
          }     
    }); 

    disease_arr.forEach(function(d){
      var ptIDs = [];
      if(('clinical' in d)&&('patient' in d['clinical'])){
        var pt = connection.db.collection(d['clinical']['patient']).find({},{'patient_ID':true});
        pt.each(function(err, item){
          if(item != null)
          ptIDs.push(item['patient_ID']);
        });
      }
      ptList[d.disease] = ptIDs;
    });

    Object.keys(ptList).forEach(function(k){
       ptList[k] = u.uniq(ptList[k]);
    });

    jsonfile.writeFile('ptList.json', ptList, {spaces:4}, function(err){console.log(err);});
    /* it's worthwhile to check the entire ajvMsg's collections on patientIDs
        add the disease-specific patientIDs to the schema and re-run ajvMsg
     */

    lookupByTool = connection.db.collection("lookup_oncoscape_tools").find();
    lookupByTool.each(function(err, item){
          if(item != null){
            tools.push(item['name']);
          }
    });

    render_chr = connection.db.collection("render_chromosome").find();
    render_chr.each(function(err, item){
          if(item != null){
            render_chr_arr.push(item['name']);
          }
    });

    render_pt = connection.db.collection("render_patient").find();
    render_pt.each(function(err, item){
          if(item != null){
            render_pt_arr.push(item['name']);
          }
    });

    var general = {
      'lookupDataSource': "Exists✔️😃",
      'lookupTools': "Exists✔️😃",
      'render_chromosome': "Exists✔️😃 Can run M+P✔️😃",
      'render_patient': "Exists✔️😃 Can run M+P✔️😃",
      'render_pca': "Exists✔️😃 Can run PCA✔️😃",
      'render_pathways': "Exists✔️😃 Can run Pathways✔️😃"
    };
    
    connection.db.listCollections().toArray(function(err, collections){  
        collections.forEach(function(c){
          all_collections.push(c['name']);
        })
        if(all_collections.indexOf("lookup_oncoscape_datasources") == -1){
          console.log("lookup_oncoscape_datasources DOES NOT exist❌");
          general['lookupDataSource'] = "DOES NOT exist.❌";
        }else{
          console.log("lookup_oncoscape_datasources exist✔️😃");
        }
        if(all_collections.indexOf("lookup_oncoscape_tools") == -1){
          console.log("lookup_oncoscape_tools DOES NOT exist❌");
          general['lookupTools'] = "DOES NOT exist";
        }
        if(all_collections.indexOf("render_chromosome") == -1){
          console.log("render_chromosome DOES NOT exist❌ M+P cannot run.");
          general['render_chromosome'] = "DOES NOT exist. CANNOT run M+P❌";
        }
        if(all_collections.indexOf("render_patient") == -1){
          console.log("render_patient DOES NOT exist❌ M+P cannot run.");
          general['render_patient'] = "DOES NOT exist. CANNOT run M+P❌";
        }
        // if(all_collections.indexOf("render_pca") == -1){
        //   console.log("render_pca DOES NOT exist❌ PCA cannot run.");
        //   general['render_pca'] = "DOES NOT exist. CANNOT run PCA❌";
        // }
        if(all_collections.indexOf("render_pathways") == -1){
          console.log("render_pathways DOES NOT exist❌ PCA cannot run.");
          general['render_pathways'] = "DOES NOT exist. CANNOT run Pathways❌";
        }
    });



    diseases.forEach(function(err, index){
      elem = {};
      elem['disease'] = diseases[index];
      //elem['general'] = general;
      elem['Spreadsheet'] = {};
      elem['MP'] = {};
      elem['PCA'] = {};
      elem['Clusters'] = {};
      elem['Pathways'] =  "✔️😃"; 
      elem['Timelines'] = {};
      console.log("Current dataset is: ", diseases[index]);
     
      
      if('edges' in disease_arr[index]){
        disease_arr[index]['edges'].forEach(function(err, i){
          var c =  disease_arr[index]['edges'][i];
          // console.log(c);
          if((typeof(c['edges']) == "string") && (typeof(c['patientWeights']) == "string") && (typeof(c['genesWeights']) == "string")){
            elem['MP']['edges'] = "✔️😃";
          }else{
            elem['MP']['edges'] = "❌";
          }
        });
      }else{
        elem['MP']['edges'] = "❌";
      }

      
      elem['Spreadsheet'] = test.spreadsheet.ExecTest(diseases[index], ajvMsg)? "✔️😃" : "❌";
      elem['PCA'] = test.pca.ExecTest(diseases[index], ajvMsg)? "✔️😃" : "❌";
      elem['Timelines'] = test.timelines.ExecTest(diseases[index], disease_arr)? "✔️😃" : "❌";
      elem['Clusters'] = test.clusters.ExecTest(diseases[index], ajvMsg)? "✔️😃" : "❌";
      elem['Heatmap'] = test.heatmap.ExecTest(diseases[index], disease_arr)? "✔️😃" : "❌";
      elem['Sunburst'] = test.sunburst.ExecTest(diseases[index], disease_arr)? "✔️😃" : "❌";   
      
      report_arr.push(elem);
    });
    // jsonfile.writeFile("testReports/report_arr.json", report_arr, {spaces: 4}, function(err){ console.error(err);});  
    // mongoose.connection.close();
   
});


