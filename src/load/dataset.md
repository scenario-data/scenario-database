# Generating a dataset

1. Get `watdiv` from https://dsg.uwaterloo.ca/watdiv/changelog.shtml and follow the installation instructions.  
   This document assumes version 0.6 is built from source

2. Execute `watdiv` in the watdiv `bin/Release` directory (segfaults otherwise):  
   `make -C path/to/this/dir model/watdiv_model && ./watdiv -d path/to/this/dir/model/watdiv_model 25 > path/to/this/dir/dataset`
   
3. Generate the payload with `make generate`
