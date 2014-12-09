/*
 * Copyright (C) 1999-2014 Jive Software. All rights reserved.
 *
 * This software is the proprietary information of Jive Software. Use is subject to license terms.
 */
/**
 * A DOMRange library, with an IE compatibility layer.
 *
 * Significant portions (including TridentSelection, TridentRange)
 * Copyright 2009, Moxiecode Systems AB and used under the terms of the LGPL
 */
(function( factory ) {
    if ( typeof define === "function" && define.amd ) {

        // AMD. Register as an anonymous module.
        define([
            'jquery'
        ], factory );
    } else {

        // Browser globals
        factory( jQuery );
    }
}(function( $ ) {

    function nodeIndex(n){
        var i = 0;
        while(n = n.previousSibling){
            ++i;
        }
        return i;
    }

    function insertAfter(n, ref){
        ref.parentNode.insertBefore(n, ref.nextSibling);
    }

    function findCommonAncestor(a, b) {
        var ps = a, pe;

        while (ps) {
            pe = b;

            while (pe && ps != pe)
                pe = pe.parentNode;

            if (ps == pe)
                break;

            ps = ps.parentNode;
        }

        if (!ps && a.ownerDocument)
            return a.ownerDocument.documentElement;

        return ps;
    }

    /**
     * TridentSelection.js
     *
     * Copyright 2009, Moxiecode Systems AB
     * Released under LGPL License.
     *
     * License: http://tinymce.moxiecode.com/license
     * Contributing: http://tinymce.moxiecode.com/contributing
     */
    var TridentSelection = (function() {
        function Selection(doc, Range) {
            var self = this;

            function getRng(){
                return doc.selection.createRange();
            }

            function createDomRange(){
                return new Range(doc);
            }

            function isSelectionCollapsed(){
                var r = getRng();
                if (!r || r.item){
                    return false;
                }
                return r.compareEndPoints('StartToEnd', r) === 0;
            }

            function getPosition(rng, start) {
                var checkRng, startIndex = 0, endIndex, inside,
                    children, child, offset, index, position = -1, parent;

                // Setup test range, collapse it and get the parent
                checkRng = rng.duplicate();
                checkRng.collapse(start);
                parent = checkRng.parentElement();

                // Check if the selection is within the right document
                if (parent.ownerDocument !== doc)
                    return;

                // IE will report non editable elements as it's parent so look for an editable one
                while (parent.contentEditable === "false") {
                    parent = parent.parentNode;
                }

                // If parent doesn't have any children then return that we are inside the element
                if (!parent.hasChildNodes()) {
                    return {node : parent, inside : 1};
                }

                // Setup node list and endIndex
                children = parent.children;
                endIndex = children.length - 1;

                // Perform a binary search for the position
                while (startIndex <= endIndex) {
                    index = Math.floor((startIndex + endIndex) / 2);

                    // Move selection to node and compare the ranges
                    child = children[index];
                    checkRng.moveToElementText(child);
                    position = checkRng.compareEndPoints(start ? 'StartToStart' : 'EndToEnd', rng);

                    // Before/after or an exact match
                    if (position > 0) {
                        endIndex = index - 1;
                    } else if (position < 0) {
                        startIndex = index + 1;
                    } else {
                        return {node : child};
                    }
                }

                // Check if child position is before or we didn't find a position
                if (position < 0) {
                    // No element child was found use the parent element and the offset inside that
                    if (!child) {
                        checkRng.moveToElementText(parent);
                        checkRng.collapse(true);
                        child = parent;
                        inside = true;
                    } else
                        checkRng.collapse(false);

                    checkRng.setEndPoint(start ? 'EndToStart' : 'EndToEnd', rng);

                    // Fix for edge case: <div style="width: 100px; height:100px;"><table>..</table>ab|c</div>
                    if (checkRng.compareEndPoints(start ? 'StartToStart' : 'StartToEnd', rng) > 0) {
                        checkRng = rng.duplicate();
                        checkRng.collapse(start);

                        offset = -1;
                        while (parent == checkRng.parentElement()) {
                            if (checkRng.move('character', -1) == 0)
                                break;

                            offset++;
                        }
                    }

                    offset = offset || checkRng.text.replace('\r\n', ' ').length;
                } else {
                    // Child position is after the selection endpoint
                    checkRng.collapse(true);
                    checkRng.setEndPoint(start ? 'StartToStart' : 'StartToEnd', rng);

                    // Get the length of the text to find where the endpoint is relative to it's container
                    offset = checkRng.text.replace('\r\n', ' ').length;
                }

                return {node : child, position : position, offset : offset, inside : inside};
            }

            // Returns a W3C DOM compatible range object by using the IE Range API
            function getRange() {
                var ieRange = getRng(), domRange = createDomRange(), element, collapsed, tmpRange, element2, bookmark, fail;

                // If selection is outside the current document just return an empty range
                element = ieRange.item ? ieRange.item(0) : ieRange.parentElement();
                if (element.ownerDocument != doc)
                    return domRange;

                collapsed = isSelectionCollapsed();

                // Handle control selection
                if (ieRange.item) {
                    domRange.setStart(element.parentNode, nodeIndex(element));
                    domRange.setEnd(domRange.startContainer, domRange.startOffset + 1);

                    return domRange;
                }

                function findEndPoint(start) {
                    var endPoint = getPosition(ieRange, start), container, offset, textNodeOffset = 0, sibling, undef, nodeValue;

                    container = endPoint.node;
                    offset = endPoint.offset;

                    if (endPoint.inside && !container.hasChildNodes()) {
                        domRange[start ? 'setStart' : 'setEnd'](container, 0);
                        return;
                    }

                    if (offset === undef) {
                        domRange[start ? 'setStartBefore' : 'setEndAfter'](container);
                        return;
                    }

                    if (endPoint.position < 0) {
                        sibling = endPoint.inside ? container.firstChild : container.nextSibling;

                        if (!sibling) {
                            domRange[start ? 'setStartAfter' : 'setEndAfter'](container);
                            return;
                        }

                        if (!offset) {
                            if (sibling.nodeType == 3)
                                domRange[start ? 'setStart' : 'setEnd'](sibling, 0);
                            else
                                domRange[start ? 'setStartBefore' : 'setEndBefore'](sibling);

                            return;
                        }

                        // Find the text node and offset
                        while (sibling) {
                            nodeValue = sibling.nodeValue;
                            textNodeOffset += nodeValue.length;

                            // We are at or passed the position we where looking for
                            if (textNodeOffset >= offset) {
                                container = sibling;
                                textNodeOffset -= offset;
                                textNodeOffset = nodeValue.length - textNodeOffset;
                                break;
                            }

                            sibling = sibling.nextSibling;
                        }
                    } else {
                        // Find the text node and offset
                        sibling = container.previousSibling;

                        if (!sibling)
                            return domRange[start ? 'setStartBefore' : 'setEndBefore'](container);

                        // If there isn't any text to loop then use the first position
                        if (!offset) {
                            if (container.nodeType == 3)
                                domRange[start ? 'setStart' : 'setEnd'](sibling, container.nodeValue.length);
                            else
                                domRange[start ? 'setStartAfter' : 'setEndAfter'](sibling);

                            return;
                        }

                        while (sibling) {
                            textNodeOffset += sibling.nodeValue.length;

                            // We are at or passed the position we where looking for
                            if (textNodeOffset >= offset) {
                                container = sibling;
                                textNodeOffset -= offset;
                                break;
                            }

                            sibling = sibling.previousSibling;
                        }
                    }

                    domRange[start ? 'setStart' : 'setEnd'](container, textNodeOffset);
                }
                try {
                    // Find start point
                    findEndPoint(true);

                    // Find end point if needed
                    if (!collapsed)
                        findEndPoint();
                } catch (ex) {
                    // IE has a nasty bug where text nodes might throw "invalid argument" when you
                    // access the nodeValue or other properties of text nodes. This seems to happend when
                    // text nodes are split into two nodes by a delete/backspace call. So lets detect it and try to fix it.
                    if (ex.number == -2147024809) {
                        // Get the current selection
                        bookmark = self.getBookmark(2);

                        // Get start element
                        tmpRange = ieRange.duplicate();
                        tmpRange.collapse(true);
                        element = tmpRange.parentElement();

                        // Get end element
                        if (!collapsed) {
                            tmpRange = ieRange.duplicate();
                            tmpRange.collapse(false);
                            element2 = tmpRange.parentElement();
                            //noinspection SillyAssignmentJS
                            element2.innerHTML = element2.innerHTML;
                        }

                        // Remove the broken elements
                        //noinspection SillyAssignmentJS
                        element.innerHTML = element.innerHTML;

                        // Restore the selection
                        self.moveToBookmark(bookmark);

                        // Since the range has moved we need to re-get it
                        ieRange = getRng();

                        // Find start point
                        findEndPoint(true);

                        // Find end point if needed
                        if (!collapsed)
                            findEndPoint();
                    } else
                        throw ex; // Throw other errors
                }

                return domRange;
            }

            this.addRange = function(rng) {
                var ieRng, ctrlRng, startContainer, startOffset, endContainer, endOffset, body = doc.body;

                function remove(n){
                    n.parentNode.removeChild(n);
                }

                function setEndPoint(start) {
                    var container, offset, marker, tmpRng, nodes;

                    marker = doc.createElement('a');
                    container = start ? startContainer : endContainer;
                    offset = start ? startOffset : endOffset;
                    tmpRng = ieRng.duplicate();

                    if (container == doc || container == doc.documentElement) {
                        container = body;
                        offset = 0;
                    }

                    if (container.nodeType == 3) {
                        container.parentNode.insertBefore(marker, container);
                        tmpRng.moveToElementText(marker);
                        tmpRng.moveStart('character', offset);
                        remove(marker);
                        ieRng.setEndPoint(start ? 'StartToStart' : 'EndToEnd', tmpRng);
                    } else {
                        nodes = container.childNodes;

                        if (nodes.length) {
                            if (offset >= nodes.length) {
                                insertAfter(marker, nodes[nodes.length - 1]);
                            } else {
                                container.insertBefore(marker, nodes[offset]);
                            }

                            tmpRng.moveToElementText(marker);
                        } else {
                            // Empty node selection for example <div>|</div>
                            marker = doc.createTextNode('\uFEFF');
                            container.appendChild(marker);
                            tmpRng.moveToElementText(marker.parentNode);
                            tmpRng.collapse(true);
                        }

                        ieRng.setEndPoint(start ? 'StartToStart' : 'EndToEnd', tmpRng);
                        remove(marker);
                    }
                }

                // Setup some shorter versions
                startContainer = rng.startContainer;
                startOffset = rng.startOffset;
                endContainer = rng.endContainer;
                endOffset = rng.endOffset;
                ieRng = body.createTextRange();

                // If single element selection then try making a control selection out of it
                if (startContainer == endContainer && startContainer.nodeType == 1 && startOffset == endOffset - 1) {
                    if (startOffset == endOffset - 1) {
                        try {
                            ctrlRng = body.createControlRange();
                            ctrlRng.addElement(startContainer.childNodes[startOffset]);
                            ctrlRng.select();
                            return;
                        } catch (ex) {
                            // Ignore
                        }
                    }
                }

                // Set start/end point of selection
                setEndPoint(true);
                setEndPoint();

                // Select the new range and scroll it into view
                ieRng.select();
            };

            // Expose range method
            this.getRangeAt = getRange;
        }
        // Expose the selection object
        return Selection;
    })();

    /*****************************************************************************************************************
     * TridentRange from MoxieCode
     */
    var TridentRange = (function() {
        // Range constructor
        function Range(doc) {
            var t = this,
                EXTRACT = 0,
                CLONE = 1,
                DELETE = 2,
                START_OFFSET = 'startOffset',
                START_CONTAINER = 'startContainer',
                END_CONTAINER = 'endContainer',
                END_OFFSET = 'endOffset',
                extend = $.extend;

            extend(t, {
                // Inital states
                startContainer : doc,
                startOffset : 0,
                endContainer : doc,
                endOffset : 0,
                collapsed : true,
                commonAncestorContainer : doc,

                // Range constants
                START_TO_START : 0,
                START_TO_END : 1,
                END_TO_END : 2,
                END_TO_START : 3,

                // Public methods
                setStart : setStart,
                setEnd : setEnd,
                setStartBefore : setStartBefore,
                setStartAfter : setStartAfter,
                setEndBefore : setEndBefore,
                setEndAfter : setEndAfter,
                collapse : collapse,
                selectNode : selectNode,
                selectNodeContents : selectNodeContents,
                compareBoundaryPoints : compareBoundaryPoints,
                deleteContents : deleteContents,
                extractContents : extractContents,
                cloneContents : cloneContents,
                insertNode : insertNode,
                surroundContents : surroundContents,
                cloneRange : cloneRange
                //toString below, needs to override Object.toString
            });

            t.toString = toString;

            function toString(){
                var df = this.cloneContents();
                var ret = [];
                var child = df.firstChild;
                while(child){
                    if(child.nodeType == 3){
                        ret.push(child.nodeValue);
                    }else if(child.nodeType == 1){
                        if(child.innerText != null){
                            ret.push(child.innerText);
                        }else{
                            ret.push(child.textContent);
                        }
                    }
                    child = child.nextSibling;
                }
                return ret.join("");
            }

            function setStart(n, o) {
                _setEndPoint(true, n, o);
            }
            function setEnd(n, o) {
                _setEndPoint(false, n, o);
            }
            function setStartBefore(n) {
                setStart(n.parentNode, nodeIndex(n));
            }
            function setStartAfter(n) {
                setStart(n.parentNode, nodeIndex(n) + 1);
            }
            function setEndBefore(n) {
                setEnd(n.parentNode, nodeIndex(n));
            }
            function setEndAfter(n) {
                setEnd(n.parentNode, nodeIndex(n) + 1);
            }
            function collapse(ts) {
                if (ts) {
                    t[END_CONTAINER] = t[START_CONTAINER];
                    t[END_OFFSET] = t[START_OFFSET];
                } else {
                    t[START_CONTAINER] = t[END_CONTAINER];
                    t[START_OFFSET] = t[END_OFFSET];
                }

                t.collapsed = true;
                t.commonAncestorContainer = t[START_CONTAINER];
            }
            function selectNode(n) {
                setStartBefore(n);
                setEndAfter(n);
            }
            function selectNodeContents(n) {
                setStart(n, 0);
                setEnd(n, n.nodeType === 1 ? n.childNodes.length : n.nodeValue.length);
            }
            function compareBoundaryPoints(h, r) {
                var sc = t[START_CONTAINER], so = t[START_OFFSET], ec = t[END_CONTAINER], eo = t[END_OFFSET],
                    rsc = r.startContainer, rso = r.startOffset, rec = r.endContainer, reo = r.endOffset;

                // Check START_TO_START
                if (h === 0)
                    return _compareBoundaryPoints(sc, so, rsc, rso);

                // Check START_TO_END
                if (h === 1)
                    return _compareBoundaryPoints(ec, eo, rsc, rso);

                // Check END_TO_END
                if (h === 2)
                    return _compareBoundaryPoints(ec, eo, rec, reo);

                // Check END_TO_START
                if (h === 3)
                    return _compareBoundaryPoints(sc, so, rec, reo);
            }
            function deleteContents() {
                _traverse(DELETE);
            }
            function extractContents() {
                return _traverse(EXTRACT);
            }
            function cloneContents() {
                return _traverse(CLONE);
            }
            function insertNode(n) {
                var startContainer = this[START_CONTAINER],
                    startOffset = this[START_OFFSET], nn, o;

                // Node is TEXT_NODE or CDATA
                if ((startContainer.nodeType === 3 || startContainer.nodeType === 4) && startContainer.nodeValue != null) {
                    if (!startOffset) {
                        // At the start of text
                        startContainer.parentNode.insertBefore(n, startContainer);
                    } else if (startOffset >= startContainer.nodeValue.length) {
                        // At the end of text
                        insertAfter(n, startContainer);
                    } else {
                        // Middle, need to split
                        nn = startContainer.splitText(startOffset);
                        startContainer.parentNode.insertBefore(n, nn);
                    }
                } else {
                    // Insert element node
                    if (startContainer.childNodes.length > 0)
                        o = startContainer.childNodes[startOffset];

                    if (o)
                        startContainer.insertBefore(n, o);
                    else
                        startContainer.appendChild(n);
                }
            }
            function surroundContents(n) {
                var f = t.extractContents();

                t.insertNode(n);
                n.appendChild(f);
                t.selectNode(n);
            }
            function cloneRange() {
                return extend(new Range(doc), {
                    startContainer : t[START_CONTAINER],
                    startOffset : t[START_OFFSET],
                    endContainer : t[END_CONTAINER],
                    endOffset : t[END_OFFSET],
                    collapsed : t.collapsed,
                    commonAncestorContainer : t.commonAncestorContainer
                });
            }
            // Private methods

            function _getSelectedNode(container, offset) {
                var child;

                if (container.nodeType == 3 /* TEXT_NODE */)
                    return container;

                if (offset < 0)
                    return container;

                child = container.firstChild;
                while (child && offset > 0) {
                    --offset;
                    child = child.nextSibling;
                }

                if (child)
                    return child;

                return container;
            }
            function _isCollapsed() {
                return (t[START_CONTAINER] == t[END_CONTAINER] && t[START_OFFSET] == t[END_OFFSET]);
            }
            function _compareBoundaryPoints(containerA, offsetA, containerB, offsetB) {
                var c, offsetC, n, cmnRoot, childA, childB;

                // In the first case the boundary-points have the same container. A is before B
                // if its offset is less than the offset of B, A is equal to B if its offset is
                // equal to the offset of B, and A is after B if its offset is greater than the
                // offset of B.
                if (containerA == containerB) {
                    if (offsetA == offsetB)
                        return 0; // equal

                    if (offsetA < offsetB)
                        return -1; // before

                    return 1; // after
                }

                // In the second case a child node C of the container of A is an ancestor
                // container of B. In this case, A is before B if the offset of A is less than or
                // equal to the index of the child node C and A is after B otherwise.
                c = containerB;
                while (c && c.parentNode != containerA)
                    c = c.parentNode;

                if (c) {
                    offsetC = 0;
                    n = containerA.firstChild;

                    while (n != c && offsetC < offsetA) {
                        offsetC++;
                        n = n.nextSibling;
                    }

                    if (offsetA <= offsetC)
                        return -1; // before

                    return 1; // after
                }

                // In the third case a child node C of the container of B is an ancestor container
                // of A. In this case, A is before B if the index of the child node C is less than
                // the offset of B and A is after B otherwise.
                c = containerA;
                while (c && c.parentNode != containerB) {
                    c = c.parentNode;
                }

                if (c) {
                    offsetC = 0;
                    n = containerB.firstChild;

                    while (n != c && offsetC < offsetB) {
                        offsetC++;
                        n = n.nextSibling;
                    }

                    if (offsetC < offsetB)
                        return -1; // before

                    return 1; // after
                }

                // In the fourth case, none of three other cases hold: the containers of A and B
                // are siblings or descendants of sibling nodes. In this case, A is before B if
                // the container of A is before the container of B in a pre-order traversal of the
                // Ranges' context tree and A is after B otherwise.
                cmnRoot = findCommonAncestor(containerA, containerB);
                childA = containerA;

                while (childA && childA.parentNode != cmnRoot)
                    childA = childA.parentNode;

                if (!childA)
                    childA = cmnRoot;

                childB = containerB;
                while (childB && childB.parentNode != cmnRoot)
                    childB = childB.parentNode;

                if (!childB)
                    childB = cmnRoot;

                if (childA == childB)
                    return 0; // equal

                n = cmnRoot.firstChild;
                while (n) {
                    if (n == childA)
                        return -1; // before

                    if (n == childB)
                        return 1; // after

                    n = n.nextSibling;
                }
            }
            function _setEndPoint(st, n, o) {
                var ec, sc;

                if (st) {
                    t[START_CONTAINER] = n;
                    t[START_OFFSET] = o;
                } else {
                    t[END_CONTAINER] = n;
                    t[END_OFFSET] = o;
                }

                // If one boundary-point of a Range is set to have a root container
                // other than the current one for the Range, the Range is collapsed to
                // the new position. This enforces the restriction that both boundary-
                // points of a Range must have the same root container.
                ec = t[END_CONTAINER];
                while (ec.parentNode)
                    ec = ec.parentNode;

                sc = t[START_CONTAINER];
                while (sc.parentNode)
                    sc = sc.parentNode;

                if (sc == ec) {
                    // The start position of a Range is guaranteed to never be after the
                    // end position. To enforce this restriction, if the start is set to
                    // be at a position after the end, the Range is collapsed to that
                    // position.
                    if (_compareBoundaryPoints(t[START_CONTAINER], t[START_OFFSET], t[END_CONTAINER], t[END_OFFSET]) > 0)
                        t.collapse(st);
                } else
                    t.collapse(st);

                t.collapsed = _isCollapsed();
                t.commonAncestorContainer = findCommonAncestor(t[START_CONTAINER], t[END_CONTAINER]);
            }
            function _traverse(how) {
                var c, endContainerDepth = 0, startContainerDepth = 0, p, depthDiff, startNode, endNode, sp, ep;

                if (t[START_CONTAINER] == t[END_CONTAINER])
                    return _traverseSameContainer(how);

                for (c = t[END_CONTAINER], p = c.parentNode; p; c = p, p = p.parentNode) {
                    if (p == t[START_CONTAINER])
                        return _traverseCommonStartContainer(c, how);

                    ++endContainerDepth;
                }

                for (c = t[START_CONTAINER], p = c.parentNode; p; c = p, p = p.parentNode) {
                    if (p == t[END_CONTAINER])
                        return _traverseCommonEndContainer(c, how);

                    ++startContainerDepth;
                }

                depthDiff = startContainerDepth - endContainerDepth;

                startNode = t[START_CONTAINER];
                while (depthDiff > 0) {
                    startNode = startNode.parentNode;
                    depthDiff--;
                }

                endNode = t[END_CONTAINER];
                while (depthDiff < 0) {
                    endNode = endNode.parentNode;
                    depthDiff++;
                }

                // ascend the ancestor hierarchy until we have a common parent.
                for (sp = startNode.parentNode, ep = endNode.parentNode; sp != ep; sp = sp.parentNode, ep = ep.parentNode) {
                    startNode = sp;
                    endNode = ep;
                }

                return _traverseCommonAncestors(startNode, endNode, how);
            }
            function _traverseSameContainer(how) {
                var frag, s, sub, n, cnt, sibling, xferNode;

                if (how != DELETE)
                    frag = doc.createDocumentFragment();

                // If selection is empty, just return the fragment
                if (t[START_OFFSET] == t[END_OFFSET])
                    return frag;

                // Text node needs special case handling
                if (t[START_CONTAINER].nodeType == 3 /* TEXT_NODE */) {
                    // get the substring
                    s = t[START_CONTAINER].nodeValue;
                    sub = s.substring(t[START_OFFSET], t[END_OFFSET]);

                    // set the original text node to its new value
                    if (how != CLONE) {
                        t[START_CONTAINER].deleteData(t[START_OFFSET], t[END_OFFSET] - t[START_OFFSET]);

                        // Nothing is partially selected, so collapse to start point
                        t.collapse(true);
                    }

                    if (how == DELETE)
                        return;

                    frag.appendChild(doc.createTextNode(sub));
                    return frag;
                }

                // Copy nodes between the start/end offsets.
                n = _getSelectedNode(t[START_CONTAINER], t[START_OFFSET]);
                cnt = t[END_OFFSET] - t[START_OFFSET];

                while (cnt > 0) {
                    sibling = n.nextSibling;
                    xferNode = _traverseFullySelected(n, how);

                    if (frag)
                        frag.appendChild( xferNode );

                    --cnt;
                    n = sibling;
                }

                // Nothing is partially selected, so collapse to start point
                if (how != CLONE)
                    t.collapse(true);

                return frag;
            }
            function _traverseCommonStartContainer(endAncestor, how) {
                var frag, n, endIdx, cnt, sibling, xferNode;

                if (how != DELETE)
                    frag = doc.createDocumentFragment();

                n = _traverseRightBoundary(endAncestor, how);

                if (frag)
                    frag.appendChild(n);

                endIdx = nodeIndex(endAncestor);
                cnt = endIdx - t[START_OFFSET];

                if (cnt <= 0) {
                    // Collapse to just before the endAncestor, which
                    // is partially selected.
                    if (how != CLONE) {
                        t.setEndBefore(endAncestor);
                        t.collapse(false);
                    }

                    return frag;
                }

                n = endAncestor.previousSibling;
                while (cnt > 0) {
                    sibling = n.previousSibling;
                    xferNode = _traverseFullySelected(n, how);

                    if (frag)
                        frag.insertBefore(xferNode, frag.firstChild);

                    --cnt;
                    n = sibling;
                }

                // Collapse to just before the endAncestor, which
                // is partially selected.
                if (how != CLONE) {
                    t.setEndBefore(endAncestor);
                    t.collapse(false);
                }

                return frag;
            }
            function _traverseCommonEndContainer(startAncestor, how) {
                var frag, startIdx, n, cnt, sibling, xferNode;

                if (how != DELETE)
                    frag = doc.createDocumentFragment();

                n = _traverseLeftBoundary(startAncestor, how);
                if (frag)
                    frag.appendChild(n);

                startIdx = nodeIndex(startAncestor);
                ++startIdx; // Because we already traversed it

                cnt = t[END_OFFSET] - startIdx;
                n = startAncestor.nextSibling;
                while (cnt > 0) {
                    sibling = n.nextSibling;
                    xferNode = _traverseFullySelected(n, how);

                    if (frag)
                        frag.appendChild(xferNode);

                    --cnt;
                    n = sibling;
                }

                if (how != CLONE) {
                    t.setStartAfter(startAncestor);
                    t.collapse(true);
                }

                return frag;
            }
            function _traverseCommonAncestors(startAncestor, endAncestor, how) {
                var n, frag, commonParent, startOffset, endOffset, cnt, sibling, nextSibling;

                if (how != DELETE)
                    frag = doc.createDocumentFragment();

                n = _traverseLeftBoundary(startAncestor, how);
                if (frag)
                    frag.appendChild(n);

                commonParent = startAncestor.parentNode;
                startOffset = nodeIndex(startAncestor);
                endOffset = nodeIndex(endAncestor);
                ++startOffset;

                cnt = endOffset - startOffset;
                sibling = startAncestor.nextSibling;

                while (cnt > 0) {
                    nextSibling = sibling.nextSibling;
                    n = _traverseFullySelected(sibling, how);

                    if (frag)
                        frag.appendChild(n);

                    sibling = nextSibling;
                    --cnt;
                }

                n = _traverseRightBoundary(endAncestor, how);

                if (frag)
                    frag.appendChild(n);

                if (how != CLONE) {
                    t.setStartAfter(startAncestor);
                    t.collapse(true);
                }

                return frag;
            }
            function _traverseRightBoundary(root, how) {
                var next = _getSelectedNode(t[END_CONTAINER], t[END_OFFSET] - 1), parent, clonedParent, prevSibling, clonedChild, clonedGrandParent, isFullySelected = next != t[END_CONTAINER];

                if (next == root)
                    return _traverseNode(next, isFullySelected, false, how);

                parent = next.parentNode;
                clonedParent = _traverseNode(parent, false, false, how);

                while (parent) {
                    while (next) {
                        prevSibling = next.previousSibling;
                        clonedChild = _traverseNode(next, isFullySelected, false, how);

                        if (how != DELETE)
                            clonedParent.insertBefore(clonedChild, clonedParent.firstChild);

                        isFullySelected = true;
                        next = prevSibling;
                    }

                    if (parent == root)
                        return clonedParent;

                    next = parent.previousSibling;
                    parent = parent.parentNode;

                    clonedGrandParent = _traverseNode(parent, false, false, how);

                    if (how != DELETE)
                        clonedGrandParent.appendChild(clonedParent);

                    clonedParent = clonedGrandParent;
                }
            }
            function _traverseLeftBoundary(root, how) {
                var next = _getSelectedNode(t[START_CONTAINER], t[START_OFFSET]), isFullySelected = next != t[START_CONTAINER], parent, clonedParent, nextSibling, clonedChild, clonedGrandParent;

                if (next == root)
                    return _traverseNode(next, isFullySelected, true, how);

                parent = next.parentNode;
                clonedParent = _traverseNode(parent, false, true, how);

                while (parent) {
                    while (next) {
                        nextSibling = next.nextSibling;
                        clonedChild = _traverseNode(next, isFullySelected, true, how);

                        if (how != DELETE)
                            clonedParent.appendChild(clonedChild);

                        isFullySelected = true;
                        next = nextSibling;
                    }

                    if (parent == root)
                        return clonedParent;

                    next = parent.nextSibling;
                    parent = parent.parentNode;

                    clonedGrandParent = _traverseNode(parent, false, true, how);

                    if (how != DELETE)
                        clonedGrandParent.appendChild(clonedParent);

                    clonedParent = clonedGrandParent;
                }
            }
            function _traverseNode(n, isFullySelected, isLeft, how) {
                var txtValue, newNodeValue, oldNodeValue, offset, newNode;

                if (isFullySelected)
                    return _traverseFullySelected(n, how);

                if (n.nodeType == 3 /* TEXT_NODE */) {
                    txtValue = n.nodeValue;

                    if (isLeft) {
                        offset = t[START_OFFSET];
                        newNodeValue = txtValue.substring(offset);
                        oldNodeValue = txtValue.substring(0, offset);
                    } else {
                        offset = t[END_OFFSET];
                        newNodeValue = txtValue.substring(0, offset);
                        oldNodeValue = txtValue.substring(offset);
                    }

                    if (how != CLONE)
                        n.nodeValue = oldNodeValue;

                    if (how == DELETE)
                        return;

                    newNode = n.cloneNode(false);
                    newNode.nodeValue = newNodeValue;

                    return newNode;
                }

                if (how == DELETE)
                    return;

                return n.cloneNode(false);
            }
            function _traverseFullySelected(n, how) {
                if (how != DELETE)
                    return how == CLONE ? n.cloneNode(true) : n;

                n.parentNode.removeChild(n);
            }
        }
        return Range;
    })();



    function selectionProviderFactory(){
        if(window.getSelection){
            return function getNormalSelection(win){
                if(!win) win = window;
                return win.getSelection();
            }
        }else if(window.document.getSelection){
            return function getLegacySelection(win){
                if(!win) win = window;
                return win.document.getSelection();
            }
        }else{
            return function getTridentSelection(win){
                if(!win) win = window;
                return new TridentSelection(win.document, TridentRange);
            }
        }
    }

    function rangeProviderFactory(){
        if(window.document.createRange){
            return function getNormalRange(doc){
                if(!doc){
                    doc = window.document;
                }
                return doc.createRange();
            }
        }else{
            return function getTridentRange(doc){
                if(!doc){
                    doc = window.document;
                }
                return new TridentRange(doc);
            }
        }

    }

    var getSelection = selectionProviderFactory();
    var getRange = rangeProviderFactory();

    function RangeContext(win){
        if(!win){
            win = window;
        }
        this.doc = win.document;
        this.selection = getSelection(win);
    }

    RangeContext.prototype.getSelection = function (){
        return this.selection;
    };

    RangeContext.prototype.getRange = function(){
        return getRange(this.doc);
    };

    RangeContext.prototype.getSelectedRange = function(){
        var rng;
        if(this.selection.rangeCount === 0){
            rng = null;
        }else{
            rng = this.selection.getRangeAt(0);
        }

        if(!rng){
            rng = this.getRange();
            rng.setStart(this.doc, 0);
            this.setSelectedRange(rng);
        }
        return rng;
    };

    RangeContext.prototype.setSelectedRange = function(rng){
        if (this.selection.rangeCount && this.selection.getRangeAt(0) == rng) {
            return;
        }

        if(this.selection.removeAllRanges){
            this.selection.removeAllRanges();
        }
        this.selection.addRange(rng);
    };


    function startPos(rng) {
        return {
            c: rng.startContainer,
            off: rng.startOffset
        };
    }

    function RangeUtils(){
    }

    RangeUtils.prototype.selectWord = function selectWord(rng, start){
        rng.collapse(start);

        var pos = startPos(rng);

        var newStartPos = this.prevCharPos(pos),
            lastPos = pos,
            ch;
        var nonWhite = /[^\s\u00a0]/;
        while(newStartPos && (ch = this.charAt(newStartPos)) && nonWhite.test(ch)){
            lastPos = newStartPos;
            newStartPos = this.prevCharPos(newStartPos);
        }
        newStartPos = lastPos;

        var newEndPos = pos;
        lastPos = newEndPos;
        while((ch = this.charAt(newEndPos)) && nonWhite.test(ch)){
            lastPos = newEndPos;
            newEndPos = this.nextCharPos(newEndPos);
        }
        if(!newEndPos){
            newEndPos = lastPos;
            if((newEndPos.nodeType == 1 && newEndPos.childNodes.length > newEndPos.off)
                || (newEndPos.nodeType == 3 && newEndPos.nodeValue.length > newEndPos.off)){
                ++newEndPos.off;
            }
        }

        rng.setStart(newStartPos.c, newStartPos.off);
        rng.setEnd(newEndPos.c, newEndPos.off);

        if(rng.collapsed){ //special-case for IE9 bugs
            return "";
        }
        return rng.toString();
    };

    RangeUtils.prototype.prevCharPos = function (treePos){
        if(treePos.c.nodeType == 3){
            if(treePos.off > 0){
                return {c: treePos.c, off: treePos.off-1};
            }else{
                return this.prevCharPos({c: treePos.c.parentNode, off: nodeIndex(treePos.c)});
            }
        }else if(treePos.c.nodeType == 1){
            if(treePos.off > 0){
                var c = treePos.c.childNodes[treePos.off-1];
                if(c.nodeType == 3){
                    return this.prevCharPos({c: c, off: c.nodeValue.length});
                }
            }
        }
        return null;
    };

    RangeUtils.prototype.nextCharPos = function(treePos){
        if(treePos.c.nodeType == 3){
            if(treePos.off < treePos.c.nodeValue.length-1){
                return {c: treePos.c, off: treePos.off+1};
            }else if(treePos.off == treePos.c.nodeValue.length-1){
                return this.nextCharPos({c: treePos.c, off: treePos.off+1});
            }else{
                //off == length
                return this.nextCharPos({c: treePos.c.parentNode, off: nodeIndex(treePos.c)+1});
            }
        }else if(treePos.c.nodeType == 1){
            if(treePos.off < treePos.c.childNodes.length){
                var c = treePos.c.childNodes[treePos.off];
                if(c.nodeType == 3){
                    if(c.nodeValue.length > 0){
                        return {c: c, off: 0};
                    }else{
                        return this.nextCharPos({c: c, off: 0});
                    }
                }
            }
        }
        return null;
    };

    RangeUtils.prototype.charAt = function(treePos){
        if(treePos && treePos.c.nodeType == 3){
            return treePos.c.nodeValue.substr(treePos.off, 1);
        }
        return null;
    };



    function createRng(startNode, startOffset, endNode, endOffset){
        var rng = startNode.ownerDocument.createRange();
        if(startNode && startOffset){
            rng.setStart(startNode, startOffset);
        }
        if(endNode && endOffset){
            rng.setEnd(endNode, endOffset);
        }else{
            rng.collapse(true);
        }

        return rng;
    }

    function isForwardSelection(sel){
        if(sel.anchorNode == null || sel.focusNode == null){
            return true; //no real support for directional selections
        }

        var anchorRange = createRng(sel.anchorNode, sel.anchorOffset);
        var focusRange = createRng(sel.focusNode, sel.focusOffset);

        //isForward if anchor is before or equal to focus
        return anchorRange.compareBoundaryPoints(anchorRange.START_TO_START, focusRange) <= 0;
    }

    function nodeName(n){
        var ret = n.nodeName;
        if(ret == "#text"){
            ret = "#" + n.nodeValue;
        }
        return ret;
    }

    function posStr(n, off){
        var pstr = "";
        if(n.parentNode && n.parentNode.nodeName != "HTML"){
            pstr = posStr(n.parentNode, nodeIndex(n)) + "/";
        }
        return pstr + nodeName(n) + (off != null ? "[" + off + "]" : "");
    }

    function logSelection(msg, rangeContext){
        if(!rangeContext){
            rangeContext = new RangeContext();
        }
        var sel = rangeContext.getSelection();

        var rng = rangeContext.getSelectedRange();
        if(!msg){
            msg = "";
        }else if(!/ $/.test(msg)){
            msg = msg + ": ";
        }

        if(sel.rangeCount == 0){
            console.log(msg + "No selection.");
        }else if(rng.collapsed){
            console.log(msg + "current selection position: " + posStr(rng.startContainer, rng.startOffset) + " (collapsed)");
        }else{
            var direction = isForwardSelection(sel) ? "->" : "<-";
            console.log(msg + "current selection range: " + posStr(rng.startContainer, rng.startOffset) + "\n\t- " + posStr(rng.endContainer, rng.endOffset) + " Direction " + direction , rng);
            if(sel.anchorNode){
                console.log("Anchor-focus" + (sel.baseNode != null ? ", base-extent: " : ": ") + posStr(sel.anchorNode, sel.anchorOffset) + " - " +
                    posStr(sel.focusNode, sel.focusOffset) +
                    (sel.baseNode != null ? ", " + posStr(sel.baseNode, sel.baseOffset) + " - " + posStr(sel.extentNode, sel.extentOffset) : ""));
            }
        }
    }

    function logRange(msg, rng){
        if(!msg){
            msg = "";
        }else if(!/ $/.test(msg)){
            msg = msg + ": ";
        }

        if(rng.collapsed){
            console.log(msg + posStr(rng.startContainer, rng.startOffset) + " (collapsed)");
        }else{
            console.log(msg + posStr(rng.startContainer, rng.startOffset) + " - " + posStr(rng.endContainer, rng.endOffset), rng);
        }
    }

    return {
        RangeContext: RangeContext,
        RangeUtils: new RangeUtils(),
        logSelection: logSelection,
        logRange: logRange
    };
});
